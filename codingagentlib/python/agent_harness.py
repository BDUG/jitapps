"""Script harness and persistent, searchable script library.

The harness runs agent scripts inside a managed virtual environment with a
small structured I/O protocol:

* ``AGENT_INPUT_JSON`` / ``AGENT_INPUT_PATH``  JSON input supplied by the caller.
* ``AGENT_RESULT_PATH``                       the script may write a JSON result here.
* ``AGENT_ARTIFACT_DIR``                      per-run directory for generated files.
* stdout line ``AGENT_RESULT: {...}``         alternative result channel (last line wins).
* ``import agent_io`` helper                  ``agent_io.load_input()`` / ``agent_io.emit(result)``.

The library is workspace scoped and survives sessions. Successful scripts can
be captured automatically (deduplicated by content hash, screened for absolute
paths and credentials) and are versioned with immutable revisions, run
statistics and lexical-vector search. Library entries never execute on their
own; running one always goes through the permission-checked harness.
"""
from __future__ import annotations

import ast
from array import array
from contextlib import closing
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import time

from .agent_memory import vector
from .agent_pyenv import inline_metadata, validate_packages

FORMAT = 'codingagentlib/script-library-v1'
MAX_SOURCE = 200000
LANGUAGES = {'.py': 'python', '.sh': 'shell', '.bash': 'shell', '.js': 'node', '.cjs': 'node', '.mjs': 'node'}
SECRET = re.compile(r'(?:sk-[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["\'][^"\']{8,}["\'])', re.I)
RESULT_PREFIX = 'AGENT_RESULT:'

AGENT_IO = '''"""Structured I/O helper supplied by the codingagentlib script harness."""
import json, os

def load_input(default=None):
    """Return the JSON input passed to this script run (or default)."""
    raw = os.environ.get('AGENT_INPUT_JSON')
    if raw is None:
        path = os.environ.get('AGENT_INPUT_PATH')
        if path and os.path.exists(path):
            with open(path, encoding='utf-8') as stream:
                raw = stream.read()
    if not raw:
        return {} if default is None else default
    return json.loads(raw)

def emit(result):
    """Record a JSON-serializable result for the harness (also printed)."""
    text = json.dumps(result, ensure_ascii=False, default=str)
    path = os.environ.get('AGENT_RESULT_PATH')
    if path:
        with open(path, 'w', encoding='utf-8') as stream:
            stream.write(text)
    print('AGENT_RESULT: ' + text, flush=True)
    return result

def artifact_dir():
    """Directory for files produced by this run."""
    path = os.environ.get('AGENT_ARTIFACT_DIR') or '.'
    os.makedirs(path, exist_ok=True)
    return path
'''


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def slug(value):
    text = re.sub(r'[^a-z0-9_-]+', '-', str(value).lower()).strip('-_')[:60]
    if not text or not text[0].isalpha():
        text = ('s-' + text)[:60]
    return text.rstrip('-_') or 'script'


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,79}', value):
        raise ValueError('Use a stable lowercase script ID (letters, digits, - or _)')
    return value


def language_for(filename):
    return LANGUAGES.get(Path(str(filename)).suffix.lower(), 'text')


def describe(source, language):
    """Derive description, symbols and usage hints from script source."""
    description, symbols = '', []
    if language == 'python':
        try:
            tree = ast.parse(source)
            description = (ast.get_docstring(tree) or '').strip()
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and not node.name.startswith('_'):
                    symbols.append(node.name)
        except SyntaxError:
            pass
    if not description:
        comments = []
        for line in source.splitlines()[:30]:
            stripped = line.strip()
            if stripped.startswith('#!') or stripped.startswith('# ///') or stripped.startswith('# codingagent'):
                continue
            if stripped.startswith(('#', '//')):
                comments.append(stripped.lstrip('#/ ').strip())
            elif stripped:
                break
        description = ' '.join(c for c in comments if c)
    tags = []
    match = re.search(r'(?mi)^\s*(?:#|//)\s*tags?\s*:\s*(.+)$', source)
    if match:
        tags = [t.strip().lower() for t in re.split(r'[,\s]+', match.group(1)) if t.strip()][:20]
    return description[:2000], symbols[:50], tags


def screen(source, language):
    """Return a reason why source must not be captured implicitly, or None."""
    if SECRET.search(source):
        return 'source appears to contain a credential'
    if language == 'python':
        try:
            tree = ast.parse(source)
        except SyntaxError as error:
            return 'Python syntax error: ' + str(error)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                text = node.value
                if re.match(r'^(?:/(?:home|Users|root|mnt|media|srv|var|opt|tmp|private)/|[A-Za-z]:\\\\)', text):
                    return 'source embeds a machine-specific absolute path'
    elif re.search(r'(?:^|[\s"\'])/(?:home|Users|root)/[^\s"\']+', source):
        return 'source embeds a machine-specific absolute path'
    return None


def parse_result(stdout_text, result_file):
    """Extract a structured result written via AGENT_RESULT_PATH or stdout marker."""
    if result_file is not None and result_file.exists():
        raw = result_file.read_bytes()[:1000001]
        if len(raw) > 1000000:
            return {'error': 'Result file exceeds 1 MB'}, 'file'
        try:
            return json.loads(raw.decode('utf-8')), 'file'
        except (ValueError, UnicodeError) as error:
            return {'error': 'Result file is not JSON: ' + str(error)[:200]}, 'file'
    found = None
    for line in (stdout_text or '').splitlines():
        if line.startswith(RESULT_PREFIX):
            found = line[len(RESULT_PREFIX):].strip()
    if found is not None:
        try:
            return json.loads(found), 'stdout'
        except ValueError as error:
            return {'error': 'AGENT_RESULT line is not JSON: ' + str(error)[:200]}, 'stdout'
    return None, None


class ScriptLibrary:
    """Versioned, searchable library of reusable scripts with run statistics."""

    def __init__(self, path):
        self.path = Path(path)
        if self.path.is_symlink():
            raise ValueError('Script library cannot be a symlink')
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self.connect()) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS scripts(id TEXT PRIMARY KEY, record TEXT NOT NULL, embedding BLOB NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS revisions(id TEXT NOT NULL, revision INTEGER NOT NULL, source TEXT NOT NULL, sha256 TEXT NOT NULL, created TEXT NOT NULL, reason TEXT NOT NULL, session TEXT, PRIMARY KEY(id, revision))')
            db.execute('CREATE TABLE IF NOT EXISTS runs(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, revision INTEGER NOT NULL, session TEXT, job TEXT, exit_code INTEGER, ok INTEGER NOT NULL, duration_ms INTEGER, created TEXT NOT NULL, summary TEXT)')
            db.execute('CREATE INDEX IF NOT EXISTS revision_hash ON revisions(sha256)')
            db.execute('CREATE INDEX IF NOT EXISTS run_script ON runs(id, seq)')
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        return db

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _embedding(record):
        text = ' '.join([record['id'].replace('-', ' '), record.get('name', ''), record.get('description', ''),
                         ' '.join(record.get('tags', [])), ' '.join(record.get('symbols', [])), record.get('language', '')])
        return array('f', vector(text)).tobytes()

    def _row(self, db, identity):
        row = db.execute('SELECT record FROM scripts WHERE id=?', (identity,)).fetchone()
        return json.loads(row['record']) if row else None

    def get(self, identity):
        identity = identifier(identity)
        with closing(self.connect()) as db:
            record = self._row(db, identity)
        if not record:
            raise ValueError('Script not found in library: ' + identity)
        return record

    def find_hash(self, sha256):
        with closing(self.connect()) as db:
            row = db.execute('SELECT id, revision FROM revisions WHERE sha256=? ORDER BY revision DESC LIMIT 1', (sha256,)).fetchone()
            if not row:
                return None
            record = self._row(db, row['id'])
        return record if record and record['sha256'] == sha256 else None

    def _validate(self, data, source, filename):
        if not isinstance(source, str) or '\0' in source or len(source.encode('utf-8')) > MAX_SOURCE:
            raise ValueError('Script source must be UTF-8 text up to 200 KB')
        language = data.get('language') or language_for(filename)
        if language not in {'python', 'shell', 'node', 'text'}:
            raise ValueError('Unsupported script language')
        if language == 'python':
            ast.parse(source)
        derived_description, symbols, derived_tags = describe(source, language)
        name = data.get('name') or Path(filename).stem
        description = data.get('description') or derived_description
        tags = data.get('tags', derived_tags)
        if not isinstance(name, str) or not name.strip() or len(name) > 200:
            raise ValueError('Invalid script name')
        if not isinstance(description, str) or len(description) > 4000:
            raise ValueError('Description must be text up to 4000 characters')
        if not isinstance(tags, list) or len(tags) > 30 or any(not isinstance(t, str) or not re.fullmatch(r'[a-z0-9][a-z0-9_.+-]{0,39}', t) for t in tags):
            raise ValueError('Tags must be up to 30 short lowercase words')
        metadata = inline_metadata(source) if language == 'python' else {}
        requirements = data.get('requirements', metadata.get('dependencies', []))
        requirements = validate_packages(list(requirements), allow_empty=True) if requirements else []
        parameters = data.get('parameters')
        if parameters is not None:
            from .contracts import check_schema
            check_schema(parameters)
            if parameters.get('type') != 'object':
                raise ValueError('Script parameters must be an object JSON schema')
        environment = data.get('env', 'default')
        if not isinstance(environment, str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,39}', environment):
            raise ValueError('Invalid environment name')
        return dict(name=name.strip(), description=description.strip(), tags=sorted(set(tags)), language=language,
                    filename=Path(filename).name[:120], symbols=symbols, requirements=requirements,
                    requiresPython=metadata.get('requiresPython'), parameters=parameters, env=environment)

    # -------------------------------------------------------------- mutations
    def save(self, data, source, *, filename=None, origin='agent', session=None, reason='', expected_revision=None):
        """Create or revise an entry. ``expected_revision`` guards concurrent edits (0 = new)."""
        filename = filename or data.get('filename') or (data.get('id', 'script') + '.py')
        identity = identifier(data.get('id') or slug(Path(filename).stem))
        fields = self._validate(data, source, filename)
        digest = hashlib.sha256(source.encode('utf-8')).hexdigest()
        if not isinstance(reason, str) or len(reason) > 2000:
            raise ValueError('Reason must be short text')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            current = self._row(db, identity)
            revision = current['revision'] if current else 0
            if expected_revision is not None and (type(expected_revision) is not int or expected_revision != revision):
                raise ValueError('Stale script revision: current revision is %d' % revision)
            if current and current['sha256'] == digest:
                # Metadata-only change keeps the source revision.
                record = {**current, **{k: v for k, v in fields.items() if k in data or k in ('symbols', 'requiresPython')}, 'updated': now()}
                db.execute('UPDATE scripts SET record=?, embedding=? WHERE id=?', (json.dumps(record), self._embedding(record), identity))
                return {**record, 'changed': False}
            created = current['created'] if current else now()
            stats = current['stats'] if current else {'runs': 0, 'successes': 0, 'failures': 0, 'lastRunAt': None, 'lastExitCode': None, 'avgDurationMs': None}
            record = dict(format=FORMAT, id=identity, revision=revision + 1, sha256=digest, bytes=len(source.encode('utf-8')),
                          lines=source.count('\n') + 1, origin=current.get('origin', origin) if current else origin,
                          pinned=current.get('pinned', False) if current else bool(data.get('pinned', False)),
                          archived=False, created=created, updated=now(), stats=stats,
                          sessions=sorted(set((current or {}).get('sessions', []) + ([session] if session else [])))[-20:], **fields)
            db.execute('INSERT OR REPLACE INTO scripts VALUES(?,?,?)', (identity, json.dumps(record), self._embedding(record)))
            db.execute('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)', (identity, record['revision'], source, digest, now(), reason or ('captured' if origin == 'auto' else 'saved'), session))
        return {**record, 'changed': True}

    def capture(self, filename, source, *, session=None, receipt=None, description=None, tags=None, env='default'):
        """Implicitly capture a successfully executed script. Never overwrites curated entries."""
        language = language_for(filename)
        if language == 'text':
            return None, 'unsupported script type'
        if len(source.encode('utf-8')) > MAX_SOURCE:
            return None, 'source exceeds 200 KB'
        if len([line for line in source.splitlines() if line.strip() and not line.strip().startswith('#')]) < 2:
            return None, 'script is too small to be reusable'
        reason = screen(source, language)
        if reason:
            return None, reason
        digest = hashlib.sha256(source.encode('utf-8')).hexdigest()
        existing = self.find_hash(digest)
        if existing:
            return existing, 'already in library'
        stem = re.sub(r'^(?:inline|library)-', '', Path(filename).stem)
        stem = re.sub(r'-[0-9a-f]{12}$', '', stem)
        identity = slug(stem)
        data = {'id': identity, 'filename': filename, 'env': env}
        if description:
            data['description'] = description
        if tags:
            data['tags'] = tags
        try:
            current = self.get(identity)
        except ValueError:
            current = None
        if current and (current.get('origin') != 'auto' or current.get('pinned')):
            for index in range(2, 100):
                candidate = (identity[:56] + '-' + str(index))
                try:
                    other = self.get(candidate)
                except ValueError:
                    data['id'] = candidate
                    break
                if other.get('origin') == 'auto' and not other.get('pinned'):
                    data['id'] = candidate
                    break
            else:
                return None, 'no free library ID'
        record = self.save(data, source, filename=filename, origin='auto', session=session,
                           reason='auto-captured after successful run' + (' (job %s)' % receipt.get('jobId') if receipt and receipt.get('jobId') else ''))
        return record, 'captured'

    def record_run(self, identity, revision, *, session=None, receipt=None, summary=None):
        receipt = receipt or {}
        ok = receipt.get('exitCode') == 0 and not receipt.get('timedOut') and not receipt.get('cancelled')
        duration = receipt.get('durationMs')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            record = self._row(db, identity)
            if not record:
                return None
            db.execute('INSERT INTO runs(id, revision, session, job, exit_code, ok, duration_ms, created, summary) VALUES(?,?,?,?,?,?,?,?,?)',
                       (identity, revision, session, receipt.get('jobId'), receipt.get('exitCode'), int(ok), duration, now(), (summary or '')[:500]))
            stats = record['stats']
            stats['runs'] += 1
            stats['successes' if ok else 'failures'] += 1
            stats['lastRunAt'], stats['lastExitCode'] = now(), receipt.get('exitCode')
            if isinstance(duration, int):
                previous = stats.get('avgDurationMs')
                stats['avgDurationMs'] = duration if previous is None else int(previous + (duration - previous) / stats['runs'])
            db.execute('UPDATE scripts SET record=? WHERE id=?', (json.dumps(record), identity))
        return stats

    def update(self, identity, data, expected_revision):
        identity = identifier(identity)
        allowed = {'name', 'description', 'tags', 'pinned', 'archived', 'parameters', 'requirements', 'env'}
        if set(data) - allowed:
            raise ValueError('Updatable fields: ' + ', '.join(sorted(allowed)))
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            record = self._row(db, identity)
            if not record:
                raise ValueError('Script not found in library: ' + identity)
            if type(expected_revision) is not int or expected_revision != record['revision']:
                raise ValueError('Stale script revision: current revision is %d' % record['revision'])
            for key in ('pinned', 'archived'):
                if key in data and not isinstance(data[key], bool):
                    raise ValueError(key + ' must be boolean')
            source = db.execute('SELECT source FROM revisions WHERE id=? AND revision=?', (identity, record['revision'])).fetchone()['source']
            merged = {k: record.get(k) for k in ('name', 'description', 'tags', 'parameters', 'requirements', 'env', 'language')}
            merged.update({k: v for k, v in data.items() if k not in ('pinned', 'archived')})
            fields = self._validate(merged, source, record['filename'])
            record.update(fields)
            for key in ('pinned', 'archived'):
                if key in data:
                    record[key] = data[key]
            if record.get('origin') == 'auto' and set(data) & {'name', 'description', 'tags', 'parameters'}:
                record['origin'] = 'agent'  # curated now; implicit capture will not overwrite it
            record['updated'] = now()
            db.execute('UPDATE scripts SET record=?, embedding=? WHERE id=?', (json.dumps(record), self._embedding(record), identity))
        return record

    def delete(self, identity, expected_revision):
        identity = identifier(identity)
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            record = self._row(db, identity)
            if not record:
                raise ValueError('Script not found in library: ' + identity)
            if type(expected_revision) is not int or expected_revision != record['revision']:
                raise ValueError('Stale script revision: current revision is %d' % record['revision'])
            db.execute('DELETE FROM scripts WHERE id=?', (identity,))
            db.execute('DELETE FROM revisions WHERE id=?', (identity,))
            db.execute('DELETE FROM runs WHERE id=?', (identity,))
        return {'id': identity, 'deleted': True}

    # ---------------------------------------------------------------- queries
    def source(self, identity, revision=None):
        identity = identifier(identity)
        with closing(self.connect()) as db:
            record = self._row(db, identity)
            if not record:
                raise ValueError('Script not found in library: ' + identity)
            revision = record['revision'] if revision is None else revision
            if type(revision) is not int:
                raise ValueError('revision must be an integer')
            row = db.execute('SELECT source, sha256 FROM revisions WHERE id=? AND revision=?', (identity, revision)).fetchone()
        if not row:
            raise ValueError('Script revision not found')
        return record, revision, row['source'], row['sha256']

    def read(self, identity, revision=None, offset=0, limit=20000):
        record, revision, source, digest = self.source(identity, revision)
        if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 64000:
            raise ValueError('Invalid source page')
        end = min(len(source), offset + limit)
        return {**record, 'revision': revision, 'sha256': digest, 'source': source[offset:end], 'offset': offset,
                'nextOffset': end, 'totalCharacters': len(source), 'done': end >= len(source),
                'note': 'Library scripts are reusable reference code. Running one still requires script_run with command permission.'}

    def history(self, identity):
        identity = identifier(identity)
        with closing(self.connect()) as db:
            rows = db.execute('SELECT revision, sha256, created, reason, session FROM revisions WHERE id=? ORDER BY revision DESC LIMIT 100', (identity,)).fetchall()
        if not rows:
            raise ValueError('Script not found in library: ' + identity)
        return {'id': identity, 'revisions': [dict(r) for r in rows]}

    def runs(self, identity, limit=20):
        identity = identifier(identity)
        if type(limit) is not int or not 1 <= limit <= 200:
            raise ValueError('limit must be 1–200')
        with closing(self.connect()) as db:
            rows = db.execute('SELECT revision, session, job, exit_code, ok, duration_ms, created, summary FROM runs WHERE id=? ORDER BY seq DESC LIMIT ?', (identity, limit)).fetchall()
        return {'id': identity, 'runs': [{**dict(r), 'ok': bool(r['ok'])} for r in rows]}

    def list(self, *, cursor=0, limit=50, tag=None, include_archived=False, language=None):
        if type(cursor) is not int or cursor < 0 or type(limit) is not int or not 1 <= limit <= 200:
            raise ValueError('Invalid library page')
        with closing(self.connect()) as db:
            records = [json.loads(r['record']) for r in db.execute('SELECT record FROM scripts ORDER BY id')]
        records = [r for r in records if (include_archived or not r.get('archived')) and (not tag or tag in r.get('tags', [])) and (not language or r.get('language') == language)]
        records.sort(key=lambda r: (not r.get('pinned'), -(r['stats']['successes']), r['id']))
        page = records[cursor:cursor + limit]
        return {'scripts': [self.summary(r) for r in page], 'total': len(records), 'nextCursor': cursor + len(page), 'done': cursor + len(page) >= len(records)}

    @staticmethod
    def summary(record):
        keys = ('id', 'name', 'description', 'tags', 'language', 'revision', 'sha256', 'origin', 'pinned', 'archived', 'requirements', 'env', 'stats', 'updated', 'parameters', 'symbols')
        out = {k: record.get(k) for k in keys}
        if out['description'] and len(out['description']) > 400:
            out['description'] = out['description'][:400] + '…'
        return out

    def search(self, query, *, limit=10, cursor=0, tag=None, include_archived=False):
        if not isinstance(query, str) or not query.strip():
            raise ValueError('Provide search keywords')
        if type(limit) is not int or not 1 <= limit <= 100 or type(cursor) is not int or cursor < 0:
            raise ValueError('Invalid search page')
        weights = [(i, w) for i, w in enumerate(vector(query)) if w]
        terms = set(re.findall(r'[a-z0-9]{3,}', query.lower()))
        scored = []
        with closing(self.connect()) as db:
            for row in db.execute('SELECT record, embedding FROM scripts'):
                record = json.loads(row['record'])
                if (record.get('archived') and not include_archived) or (tag and tag not in record.get('tags', [])):
                    continue
                values = array('f')
                values.frombytes(row['embedding'])
                similarity = sum(w * values[i] for i, w in weights)
                haystack = (record['id'] + ' ' + record.get('name', '') + ' ' + ' '.join(record.get('tags', []))).lower()
                keyword = sum(1 for t in terms if t in haystack) / max(1, len(terms))
                stats = record['stats']
                reliability = (stats['successes'] + 1) / (stats['runs'] + 2)
                score = similarity + 0.35 * keyword + 0.1 * reliability + (0.05 if record.get('pinned') else 0) + 0.02 * math.log1p(stats['successes'])
                if similarity > 0 or keyword > 0:
                    scored.append((score, record))
        scored.sort(key=lambda item: (-item[0], item[1]['id']))
        page = scored[cursor:cursor + limit]
        return {'matches': [{**self.summary(r), 'score': round(s, 4)} for s, r in page], 'total': len(scored),
                'nextCursor': cursor + len(page), 'done': cursor + len(page) >= len(scored),
                'note': 'Lexical-vector ranking boosted by keyword matches, reliability and pinning; not a semantic guarantee.'}

    def stats(self):
        with closing(self.connect()) as db:
            records = [json.loads(r['record']) for r in db.execute('SELECT record FROM scripts')]
            runs = db.execute('SELECT COUNT(*), SUM(ok) FROM runs').fetchone()
        return {'format': FORMAT, 'scripts': len(records), 'archived': sum(bool(r.get('archived')) for r in records),
                'pinned': sum(bool(r.get('pinned')) for r in records),
                'byOrigin': {o: sum(r.get('origin') == o for r in records) for o in ('auto', 'agent', 'user', 'import')},
                'byLanguage': {l: sum(r.get('language') == l for r in records) for l in sorted({r.get('language') for r in records})},
                'runs': runs[0] or 0, 'successfulRuns': runs[1] or 0}

    def export(self, ids=None):
        with closing(self.connect()) as db:
            all_ids = [r['id'] for r in db.execute('SELECT id FROM scripts ORDER BY id')]
        ids = all_ids if ids is None else ids
        if not isinstance(ids, list) or len(ids) > 500:
            raise ValueError('Export up to 500 script IDs')
        scripts = []
        for identity in ids:
            record, revision, source, digest = self.source(identity)
            scripts.append({**{k: v for k, v in record.items() if k not in ('stats', 'sessions')}, 'source': source})
        bundle = {'format': FORMAT + '+bundle', 'version': 1, 'exported': now(), 'scripts': scripts}
        if len(json.dumps(bundle).encode()) > 20000000:
            raise ValueError('Export exceeds 20 MB; select fewer scripts')
        return bundle

    def import_bundle(self, bundle, *, overwrite=False):
        if not isinstance(bundle, dict) or bundle.get('format') != FORMAT + '+bundle' or bundle.get('version') != 1 or not isinstance(bundle.get('scripts'), list):
            raise ValueError('Invalid script library bundle')
        imported, skipped = [], []
        for item in bundle['scripts']:
            if not isinstance(item, dict) or not isinstance(item.get('source'), str):
                raise ValueError('Invalid script in bundle')
            identity = identifier(item.get('id'))
            try:
                current = self.get(identity)
            except ValueError:
                current = None
            if current and not overwrite:
                skipped.append(identity)
                continue
            data = {k: item[k] for k in ('id', 'name', 'description', 'tags', 'parameters', 'requirements', 'env', 'language') if k in item and item[k] is not None}
            record = self.save(data, item['source'], filename=item.get('filename') or identity + '.py', origin='import', reason='imported')
            imported.append({'id': record['id'], 'revision': record['revision']})
        return {'imported': imported, 'skipped': skipped, 'executed': False}
