"""File-based progressive discovery and bounded asynchronous conventions memory."""
from concurrent.futures import ThreadPoolExecutor
import ast
import json
from pathlib import Path
import subprocess


class Conventions:
    def __init__(self, repository, store, *, disabled_skills=(), context_window=32000, secrets=()):
        self.repository, self.store = Path(repository).resolve(), store
        self.disabled, self.context_window = set(disabled_skills), context_window
        self.secrets = secrets
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='extension-memory')
        self.futures = []
        with store.lock:
            store.db.execute('CREATE TABLE IF NOT EXISTS extension_memory(repository TEXT PRIMARY KEY, body TEXT)')

    def _files(self):
        # Git's tracked file inventory works on a fresh clone; no vector index/database.
        output = subprocess.run(['git', '-C', str(self.repository), 'ls-files', '-z'],
                                check=True, capture_output=True, timeout=10).stdout
        return [path.decode() for path in output.split(b'\0') if path]

    def _read(self, relative):
        path = self.repository / relative
        if path.is_symlink() or not path.resolve().is_relative_to(self.repository):
            raise PermissionError('Convention files must stay in the repository')
        if path.stat().st_size > 100000:
            raise ValueError('Convention file too large')
        return path.read_text()

    def skills(self, metadata):
        words = set(str(metadata).lower().replace('_', ' ').split())
        result = []
        for path in self._files():
            if not path.startswith(('.agents/skills/', '.extension/skills/')) or not path.endswith('/SKILL.md'):
                continue
            name = Path(path).parent.name
            if name in self.disabled:
                continue
            # Only front matter/heading is disclosed until explicitly loading a skill.
            lines = self._read(path).splitlines()
            if lines and lines[0] == '---':
                end = next((i for i, line in enumerate(lines[1:40], 1) if line == '---'), 1)
                header = '\n'.join(lines[1:end])
            else:
                header = next((line for line in lines if line.startswith('#')), name)
            if words.intersection(header.lower().replace('_', ' ').split()):
                result.append(dict(id=name, path=path, metadata=header))
        return result

    def load_skill(self, name):
        if name in self.disabled:
            raise PermissionError('Skill is disabled')
        matches = [path for path in self._files() if path.startswith(('.agents/skills/', '.extension/skills/'))
                   and path.endswith('/SKILL.md') and Path(path).parent.name == name]
        if len(matches) != 1:
            raise ValueError('Skill missing or ambiguous')
        return self._read(matches[0])

    def context(self, metadata='', *, tokenizer=None):
        with self.store.lock:
            row = self.store.db.execute('SELECT body FROM extension_memory WHERE repository=?',
                                        (str(self.repository),)).fetchone()
        instructions = self._read('AGENTS.md') if 'AGENTS.md' in self._files() else ''
        value = dict(instructions=instructions, skills=self.skills(metadata), memory=row[0] if row else '')
        from .audit import redact
        value = redact(value, self.secrets)
        text = json.dumps(value, ensure_ascii=False)
        # UTF-8 bytes upper-bound byte-based tokenizer token counts; host may inject
        # its exact tokenizer. Never estimate chars/4 for a hard token constraint.
        count = tokenizer or (lambda s: len(s.encode('utf-8')))
        limit = int(self.context_window * .04)
        if count(text) > limit:
            while value['skills'] and count(json.dumps(value, ensure_ascii=False)) > limit:
                value['skills'].pop()
            for field in ('memory', 'instructions'):
                while value[field] and count(json.dumps(value, ensure_ascii=False)) > limit:
                    value[field] = value[field][:len(value[field]) // 2]
        if count(json.dumps(value, ensure_ascii=False)) > limit:
            return ''
        return json.dumps(value, ensure_ascii=False)

    def inspect(self, query, *, kind='text', limit=40):
        """Fresh-clone source/history/symbol inspection; no index build or execution."""
        if not isinstance(query, str) or not query or len(query) > 2000 or not 1 <= limit <= 100:
            raise ValueError('Bounded literal inspection query required')
        if kind == 'history':
            output = subprocess.run(['git', '-C', str(self.repository), 'log', '--all',
                f'-{limit}', '--format=%H %s', '--fixed-strings', '--grep=' + query],
                check=True, text=True, capture_output=True, timeout=10).stdout
            return output.splitlines()
        if kind not in ('text', 'symbols'):
            raise ValueError('Choose text, symbols or history')
        matches = []
        for path in self._files():
            if kind == 'symbols' and not path.endswith('.py'):
                continue
            try:
                text = self._read(path)
            except (UnicodeError, ValueError, OSError):
                continue
            if kind == 'symbols':
                try:
                    tree = ast.parse(text)
                except SyntaxError:
                    continue
                found = [dict(path=path, line=node.lineno, symbol=node.name) for node in ast.walk(tree)
                         if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and query in node.name]
            else:
                found = [dict(path=path, line=i, text=line[:500]) for i, line in enumerate(text.splitlines(), 1)
                         if query in line]
            matches.extend(found[:limit - len(matches)])
            if len(matches) >= limit:
                break
        return matches

    def learn_async(self, text):
        from .audit import redact
        if not isinstance(text, str) or len(text.encode()) > int(self.context_window * .04):
            raise ValueError('Learning exceeds context budget')
        def save():
            with self.store.lock:
                self.store.db.execute('INSERT OR REPLACE INTO extension_memory VALUES(?,?)',
                                      (str(self.repository), redact(text, self.secrets)))
        future = self.executor.submit(save)
        self.futures.append(future)
        return future

    def close(self):
        self.executor.shutdown(wait=True)
        for future in self.futures:
            future.result()
