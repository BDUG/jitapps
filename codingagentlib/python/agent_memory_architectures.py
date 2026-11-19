"""Advanced agent memory architectures: StructMem, egGENT, A-MEM, MAGMA, and GAM.

Each architecture addresses a distinct dimension of coding-agent memory and
shares one local SQLite store so they reinforce one another without external
dependencies:

1. **StructMem** (``StructMemStore``)
   Typed, schema-validated structured records (``entity``, ``file_summary``,
   ``api_contract``, ``error_pattern``, ``decision``, ``config``,
   ``dependency``) with subject/predicate/object/attribute indexing for exact
   field queries alongside lexical-vector search.

2. **egGENT** (``EggentEpisodicGraph``)
   Episodic Event-Graph memory modeling sessions as temporal/causal
   ``StateBefore -> Action -> Observation -> StateAfter -> Outcome``
   trajectories so agents can inspect how prior states led to success or
   failure.

3. **A-MEM** (``AMemNetwork``)
   Zettelkasten-style atomic memory notes with contextual descriptions,
   keywords, tags, and bidirectional semantic links. Inserting a note
   automatically links and evolves related existing notes (updating keywords,
   tags, and link neighborhoods; optionally delegates to a host ``evolver``
   callback).

4. **MAGMA** (``MagmaMultiGraph``)
   Multi-graph memory maintaining four synchronized views — **semantic**,
   **temporal**, **causal**, and **entity** — with query-intent routing,
   bounded spreading-activation traversal, and Reciprocal Rank Fusion (RRF).

5. **GAM** (``GamMemoryEngine``)
   Dual-module **Memorizer + Researcher** engine. The Memorizer builds
   segmented session memory pages/abstracts; the Researcher executes a
   bounded iterative retrieval-reflection loop (plan -> retrieve across
   StructMem/egGENT/A-MEM/MAGMA -> check coverage -> refine sub-queries ->
   synthesize evidence packet).

All recalled records are untrusted reference data for the model, never
instructions, permissions, or verification proof.
"""
from __future__ import annotations

from array import array
from contextlib import closing
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import time
import uuid

from .agent_memory import vector, DIMENSIONS, MODEL

FORMAT = 'codingagentlib/memory-architectures-v1'

STRUCT_SCHEMAS = {
    'entity': {'required': ['subject', 'kind'], 'optional': ['summary', 'path', 'attributes']},
    'file_summary': {'required': ['path', 'purpose'], 'optional': ['symbols', 'dependencies', 'language']},
    'api_contract': {'required': ['name', 'signature'], 'optional': ['inputs', 'outputs', 'errors', 'path']},
    'error_pattern': {'required': ['signature', 'cause', 'fix'], 'optional': ['tool', 'path', 'command']},
    'decision': {'required': ['topic', 'choice', 'rationale'], 'optional': ['alternatives', 'scope']},
    'config': {'required': ['key', 'value'], 'optional': ['scope', 'source']},
    'dependency': {'required': ['subject', 'relation', 'target'], 'optional': ['version', 'scope']},
}

MAGMA_VIEWS = ('semantic', 'temporal', 'causal', 'entity')


def _utc(ts=None):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(ts if ts is not None else time.time()))


def _cosine(a, b):
    return sum(x * y for x, y in zip(a, b))


def _terms(text):
    return set(re.findall(r'[a-z0-9][a-z0-9_.-]{1,}', (text or '').lower()))


def _blob(text):
    return array('f', vector(text or '')).tobytes()


def _from_blob(raw):
    values = array('f')
    values.frombytes(raw)
    return values


# ===================================================================== StructMem
class StructMemStore:
    """Schema-validated structured memory records with attribute queries."""

    def __init__(self, connect, clock=time.time):
        self.connect = connect
        self.clock = clock

    def schemas(self):
        return {'format': FORMAT, 'schemas': STRUCT_SCHEMAS}

    def store(self, schema, data, *, id=None, source=None, tags=None, confidence=0.85):
        if schema not in STRUCT_SCHEMAS:
            raise ValueError('Unknown StructMem schema %r; expected one of: %s' % (schema, ', '.join(sorted(STRUCT_SCHEMAS))))
        if not isinstance(data, dict):
            raise ValueError('StructMem data must be a JSON object')
        spec = STRUCT_SCHEMAS[schema]
        missing = [f for f in spec['required'] if not data.get(f)]
        if missing:
            raise ValueError('StructMem %s missing required fields: %s' % (schema, ', '.join(missing)))
        allowed = set(spec['required']) | set(spec['optional'])
        unknown = set(data) - allowed
        if unknown:
            raise ValueError('StructMem %s has unsupported fields: %s' % (schema, ', '.join(sorted(unknown))))
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
            raise ValueError('confidence must be 0..1')
        tags = sorted({str(t).lower() for t in (tags or []) if isinstance(t, str) and t.strip()})[:20]
        subject = str(data.get('subject') or data.get('name') or data.get('topic') or data.get('key') or data.get('path') or data.get('signature'))[:200]
        predicate = str(data.get('relation') or data.get('kind') or schema)[:120]
        obj = str(data.get('target') or data.get('choice') or data.get('value') or data.get('fix') or data.get('purpose') or data.get('signature'))[:300]
        text = schema + ' ' + subject + ' ' + predicate + ' ' + obj + ' ' + json.dumps(data, ensure_ascii=False) + ' ' + ' '.join(tags)
        digest = hashlib.sha256((schema + '\0' + json.dumps(data, sort_keys=True, ensure_ascii=False)).encode('utf-8')).hexdigest()
        now = self.clock()
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT id, revision FROM struct_records WHERE hash=?', (digest,)).fetchone()
            if existing and id is None:
                db.execute('UPDATE struct_records SET updated=?, confidence=?, tags=? WHERE id=?',
                           (now, max(confidence, 0.5), json.dumps(tags), existing['id']))
                return {'id': existing['id'], 'schema': schema, 'revision': existing['revision'], 'deduplicated': True}
            if id is not None:
                row = db.execute('SELECT revision FROM struct_records WHERE id=?', (id,)).fetchone()
                rev = (row['revision'] + 1) if row else 1
            else:
                id = 'sm_' + uuid.uuid4().hex[:14]
                rev = 1
            db.execute('INSERT OR REPLACE INTO struct_records VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                       (id, schema, subject, predicate, obj, json.dumps(data, ensure_ascii=False),
                        json.dumps(tags), float(confidence), now, rev, digest, _blob(text)))
            if source:
                db.execute('INSERT OR REPLACE INTO struct_sources VALUES(?,?)', (id, json.dumps(source, ensure_ascii=False)))
        return {'id': id, 'schema': schema, 'subject': subject, 'revision': rev, 'deduplicated': False}

    def get(self, id):
        with closing(self.connect()) as db:
            row = db.execute('SELECT * FROM struct_records WHERE id=?', (id,)).fetchone()
            if not row:
                raise ValueError('StructMem record not found: ' + str(id))
            src = db.execute('SELECT source FROM struct_sources WHERE id=?', (id,)).fetchone()
        return {
            'id': row['id'], 'schema': row['schema'], 'subject': row['subject'],
            'predicate': row['predicate'], 'object': row['object'],
            'data': json.loads(row['data']), 'tags': json.loads(row['tags']),
            'confidence': row['confidence'], 'updated': _utc(row['updated']),
            'revision': row['revision'], 'source': json.loads(src['source']) if src else {},
        }

    def query(self, *, query='', schema=None, subject=None, tag=None, limit=12):
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError('limit must be 1–100')
        if schema is not None and schema not in STRUCT_SCHEMAS:
            raise ValueError('Unknown StructMem schema')
        weights = [(i, w) for i, w in enumerate(vector(query)) if w] if query else []
        wanted = _terms(query)
        scored = []
        with closing(self.connect()) as db:
            sql = 'SELECT * FROM struct_records'
            clauses, args = [], []
            if schema:
                clauses.append('schema=?')
                args.append(schema)
            if subject:
                clauses.append('LOWER(subject) LIKE ?')
                args.append('%' + subject.lower() + '%')
            if clauses:
                sql += ' WHERE ' + ' AND '.join(clauses)
            for row in db.execute(sql, args):
                tags = set(json.loads(row['tags']))
                if tag and tag.lower() not in tags:
                    continue
                if weights:
                    vec = _from_blob(row['embedding'])
                    sim = max(0.0, sum(w * vec[i] for i, w in weights))
                    kw = len(wanted & (_terms(row['subject'] + ' ' + row['object'] + ' ' + row['data']) | tags)) / max(1, len(wanted))
                    if sim <= 0 and kw <= 0 and not subject:
                        continue
                    score = 0.6 * sim + 0.25 * kw + 0.15 * row['confidence']
                else:
                    score = row['confidence']
                scored.append((score, row))
        scored.sort(key=lambda item: (-item[0], -item[1]['updated']))
        return {
            'architecture': 'StructMem',
            'records': [{
                'id': r['id'], 'schema': r['schema'], 'subject': r['subject'],
                'predicate': r['predicate'], 'object': r['object'],
                'data': json.loads(r['data']), 'tags': json.loads(r['tags']),
                'confidence': r['confidence'], 'score': round(s, 4), 'updated': _utc(r['updated']),
            } for s, r in scored[:limit]],
            'total': len(scored),
        }

    def delete(self, id):
        with closing(self.connect()) as db, db:
            db.execute('DELETE FROM struct_sources WHERE id=?', (id,))
            deleted = db.execute('DELETE FROM struct_records WHERE id=?', (id,)).rowcount
        return {'id': id, 'deleted': bool(deleted)}


# ====================================================================== egGENT
class EggentEpisodicGraph:
    """Episodic Event-Graph capturing State -> Action -> Observation -> Outcome."""

    def __init__(self, connect, clock=time.time):
        self.connect = connect
        self.clock = clock

    def record_episode(self, session):
        sid = session['id']
        events = session.get('events') or []
        if not events:
            return {'episodeId': sid, 'steps': 0, 'edges': 0}
        completion = next((e['value'] for e in reversed(events) if e['kind'] == 'completion'), {})
        outcome = completion.get('outcome') or session.get('status') or 'paused'
        goal = session.get('goal', '')[:1000]
        actions = {}
        nodes, edges = [], []
        prev_node_id = None
        last_failure_node = None
        now = self.clock()
        for ev in events:
            val = ev.get('value') or {}
            kind = ev.get('kind')
            if kind == 'action' and val.get('id'):
                actions[val['id']] = val
            elif kind == 'observation' and not val.get('parentCallId'):
                cid = val.get('id') or ('step_' + str(ev.get('index', len(nodes))))
                act = actions.get(cid, {})
                tool = val.get('tool') or act.get('tool') or 'unknown'
                args = act.get('args') or {}
                target = str(args.get('path') or args.get('command') or args.get('libraryId') or args.get('query') or '')[:200]
                res = val.get('result') or {}
                failed = val.get('ok') is False or bool(res.get('timedOut')) or bool(res.get('cancelled')) or (isinstance(res.get('exitCode'), int) and res['exitCode'] != 0)
                status = 'failed' if failed else 'ok'
                summary = f"{tool}({target}) -> {status}"
                if failed and val.get('error'):
                    summary += ': ' + str(val['error'])[:160]
                elif isinstance(res.get('exitCode'), int):
                    summary += f" (exit {res['exitCode']})"
                node_id = f"eg_{sid[:10]}_{len(nodes)}"
                nodes.append((node_id, sid, len(nodes), tool, target, status, summary, json.dumps({'callId': cid, 'args': args, 'exitCode': res.get('exitCode')}, ensure_ascii=False), now, _blob(goal + ' ' + summary)))
                if prev_node_id is not None:
                    edges.append((prev_node_id, node_id, 'PRECEDES', 1.0))
                if failed:
                    last_failure_node = node_id
                elif last_failure_node is not None:
                    edges.append((last_failure_node, node_id, 'RESOLVED_BY', 0.9))
                    last_failure_node = None
                prev_node_id = node_id
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM eggent_edges WHERE src IN (SELECT id FROM eggent_nodes WHERE episode_id=?)', (sid,))
            db.execute('DELETE FROM eggent_nodes WHERE episode_id=?', (sid,))
            db.execute('INSERT OR REPLACE INTO eggent_episodes VALUES(?,?,?,?,?,?)',
                       (sid, goal, outcome, str(completion.get('summary', ''))[:1200], len(nodes), now))
            db.executemany('INSERT INTO eggent_nodes VALUES(?,?,?,?,?,?,?,?,?,?)', nodes)
            db.executemany('INSERT OR REPLACE INTO eggent_edges VALUES(?,?,?,?)', edges)
        return {'episodeId': sid, 'outcome': outcome, 'steps': len(nodes), 'edges': len(edges)}

    def query(self, query='', *, outcome=None, limit=8):
        if type(limit) is not int or not 1 <= limit <= 50:
            raise ValueError('limit must be 1–50')
        weights = [(i, w) for i, w in enumerate(vector(query)) if w] if query else []
        scored = []
        with closing(self.connect()) as db:
            for ep in db.execute('SELECT * FROM eggent_episodes ORDER BY created DESC LIMIT 200'):
                if outcome and ep['outcome'] != outcome:
                    continue
                nodes = db.execute('SELECT * FROM eggent_nodes WHERE episode_id=? ORDER BY step_index', (ep['id'],)).fetchall()
                ep_text = ep['goal'] + ' ' + ep['summary'] + ' ' + ' '.join(n['summary'] for n in nodes)
                if weights:
                    vec = vector(ep_text)
                    sim = max(0.0, sum(w * vec[i] for i, w in weights))
                    if sim <= 0:
                        continue
                else:
                    sim = 0.5
                edges = db.execute('SELECT * FROM eggent_edges WHERE src IN (SELECT id FROM eggent_nodes WHERE episode_id=?)', (ep['id'],)).fetchall()
                scored.append((sim, ep, nodes, edges))
        scored.sort(key=lambda item: (-item[0], -item[1]['created']))
        trajectories = []
        for sim, ep, nodes, edges in scored[:limit]:
            trajectories.append({
                'episodeId': ep['id'],
                'goal': ep['goal'],
                'outcome': ep['outcome'],
                'summary': ep['summary'],
                'score': round(sim, 4),
                'trajectory': [{'id': n['id'], 'step': n['step_index'], 'tool': n['tool'], 'target': n['target'], 'status': n['status'], 'summary': n['summary']} for n in nodes[:25]],
                'transitions': [{'from': e['src'], 'to': e['dst'], 'relation': e['relation']} for e in edges[:40]],
            })
        return {'architecture': 'egGENT', 'episodes': trajectories, 'total': len(scored)}


# ======================================================================= A-MEM
class AMemNetwork:
    """Zettelkasten-inspired self-organizing atomic notes with dynamic evolution."""

    def __init__(self, connect, clock=time.time, evolver=None):
        self.connect = connect
        self.clock = clock
        self.evolver = evolver

    @staticmethod
    def _extract_keywords(text, tags=()):
        counts = {}
        for token in re.findall(r'[a-zA-Z][a-zA-Z0-9_.-]{2,}', text or ''):
            low = token.lower()
            if low in {'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'were', 'not', 'but'}:
                continue
            counts[low] = counts.get(low, 0) + 1
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        return sorted(set([k for k, _ in ranked[:10]] + [t.lower() for t in tags]))[:15]

    def add_note(self, content, *, context='', tags=None, keywords=None, source=None, top_k=5):
        if not isinstance(content, str) or not content.strip():
            raise ValueError('A-MEM note content must be nonempty')
        content = content.strip()[:12000]
        tags = sorted({str(t).lower() for t in (tags or []) if isinstance(t, str) and t.strip()})[:20]
        keywords = sorted(set(keywords or self._extract_keywords(content + ' ' + context, tags)))[:20]
        if not context:
            context = re.sub(r'\s+', ' ', content.splitlines()[0])[:240]
        vec = vector(content + '\n' + context + '\n' + ' '.join(keywords) + '\n' + ' '.join(tags))
        note_id = 'am_' + uuid.uuid4().hex[:14]
        now = self.clock()
        linked = []
        evolved = []
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            candidates = []
            for row in db.execute('SELECT * FROM amem_notes'):
                sim = _cosine(vec, _from_blob(row['embedding']))
                if sim >= 0.22:
                    candidates.append((sim, row))
            candidates.sort(key=lambda item: -item[0])
            neighbors = candidates[:top_k]
            neighbor_ids = [r['id'] for _, r in neighbors]
            db.execute('INSERT INTO amem_notes VALUES(?,?,?,?,?,?,?,?,?,?)',
                       (note_id, content, context, json.dumps(keywords), json.dumps(tags),
                        json.dumps(neighbor_ids), json.dumps(source or {}), now, now, array('f', vec).tobytes()))
            # Bidirectional linking + dynamic evolution of existing neighbor notes
            for sim, row in neighbors:
                old_links = json.loads(row['links'])
                if note_id not in old_links:
                    old_links.append(note_id)
                old_kw = json.loads(row['keywords'])
                old_tags = json.loads(row['tags'])
                shared_kw = sorted(set(old_kw) | (set(keywords) & set(_terms(row['content'] + ' ' + context))))[:20]
                new_tags = sorted(set(old_tags) | (set(tags) if sim >= 0.45 else set()))[:20]
                new_ctx = row['context']
                if self.evolver is not None:
                    try:
                        patch = self.evolver(
                            new_note={'id': note_id, 'content': content, 'context': context, 'keywords': keywords, 'tags': tags},
                            existing_note={'id': row['id'], 'content': row['content'], 'context': row['context'], 'keywords': old_kw, 'tags': old_tags},
                            similarity=sim,
                        )
                        if isinstance(patch, dict):
                            new_ctx = str(patch.get('context', new_ctx))[:400]
                            shared_kw = sorted(set(patch.get('keywords', shared_kw)))[:20]
                            new_tags = sorted(set(patch.get('tags', new_tags)))[:20]
                    except Exception:
                        pass
                db.execute('UPDATE amem_notes SET links=?, keywords=?, tags=?, context=?, evolved=? WHERE id=?',
                           (json.dumps(old_links[-30:]), json.dumps(shared_kw), json.dumps(new_tags), new_ctx, now, row['id']))
                linked.append({'id': row['id'], 'similarity': round(sim, 4)})
                evolved.append(row['id'])
        return {'id': note_id, 'keywords': keywords, 'tags': tags, 'links': linked, 'evolvedNeighbors': evolved}

    def search(self, query, *, limit=8, expand_links=True):
        if type(limit) is not int or not 1 <= limit <= 50:
            raise ValueError('limit must be 1–50')
        weights = [(i, w) for i, w in enumerate(vector(query)) if w] if query else []
        scored = []
        by_id = {}
        with closing(self.connect()) as db:
            for row in db.execute('SELECT * FROM amem_notes'):
                by_id[row['id']] = row
                if weights:
                    vec = _from_blob(row['embedding'])
                    sim = max(0.0, sum(w * vec[i] for i, w in weights))
                    if sim <= 0:
                        continue
                else:
                    sim = 0.5
                scored.append((sim, row))
        scored.sort(key=lambda item: (-item[0], -item[1]['evolved']))
        results = []
        seen = set()
        for sim, row in scored[:limit]:
            seen.add(row['id'])
            links = json.loads(row['links'])
            neighbors = []
            if expand_links:
                for nid in links[:4]:
                    if nid in by_id and nid not in seen:
                        n = by_id[nid]
                        neighbors.append({'id': nid, 'context': n['context'], 'tags': json.loads(n['tags'])})
            results.append({
                'id': row['id'], 'content': row['content'], 'context': row['context'],
                'keywords': json.loads(row['keywords']), 'tags': json.loads(row['tags']),
                'links': links, 'linkedNeighbors': neighbors, 'score': round(sim, 4),
                'created': _utc(row['created']), 'evolved': _utc(row['evolved']),
            })
        return {'architecture': 'A-MEM', 'notes': results, 'total': len(scored)}


# ======================================================================= MAGMA
class MagmaMultiGraph:
    """Multi-graph memory: Semantic, Temporal, Causal, and Entity views + RRF."""

    def __init__(self, connect, clock=time.time):
        self.connect = connect
        self.clock = clock

    def add_node(self, content, *, kind='observation', entities=None, session=None, id=None, metadata=None):
        if not isinstance(content, str) or not content.strip():
            raise ValueError('MAGMA node content must be nonempty')
        node_id = id or ('mg_' + uuid.uuid4().hex[:14])
        entities = sorted({str(e).lower() for e in (entities or []) if isinstance(e, str) and e.strip()})[:30]
        now = self.clock()
        vec = vector(content + ' ' + ' '.join(entities))
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            prev = db.execute('SELECT id FROM magma_nodes WHERE session=? ORDER BY created DESC LIMIT 1', (session or '',)).fetchone()
            db.execute('INSERT OR REPLACE INTO magma_nodes VALUES(?,?,?,?,?,?,?,?)',
                       (node_id, kind, content.strip()[:8000], json.dumps(entities), session or '', json.dumps(metadata or {}), now, array('f', vec).tobytes()))
            if prev and prev['id'] != node_id:
                db.execute('INSERT OR REPLACE INTO magma_edges VALUES(?,?,?,?)', (prev['id'], node_id, 'temporal', 1.0))
            for other in db.execute('SELECT id, entities, embedding FROM magma_nodes WHERE id!=? ORDER BY created DESC LIMIT 200', (node_id,)):
                other_ent = set(json.loads(other['entities']))
                shared = len(set(entities) & other_ent)
                if shared:
                    db.execute('INSERT OR REPLACE INTO magma_edges VALUES(?,?,?,?)', (node_id, other['id'], 'entity', min(1.0, 0.3 * shared)))
                    db.execute('INSERT OR REPLACE INTO magma_edges VALUES(?,?,?,?)', (other['id'], node_id, 'entity', min(1.0, 0.3 * shared)))
                sim = _cosine(vec, _from_blob(other['embedding']))
                if sim >= 0.35:
                    db.execute('INSERT OR REPLACE INTO magma_edges VALUES(?,?,?,?)', (node_id, other['id'], 'semantic', round(sim, 4)))
                    db.execute('INSERT OR REPLACE INTO magma_edges VALUES(?,?,?,?)', (other['id'], node_id, 'semantic', round(sim, 4)))
        return {'id': node_id, 'entities': entities}

    def link(self, src, dst, view, weight=1.0):
        if view not in MAGMA_VIEWS:
            raise ValueError('MAGMA view must be one of: ' + ', '.join(MAGMA_VIEWS))
        with closing(self.connect()) as db, db:
            db.execute('INSERT OR REPLACE INTO magma_edges VALUES(?,?,?,?)', (src, dst, view, float(weight)))
        return {'src': src, 'dst': dst, 'view': view, 'weight': float(weight)}

    @staticmethod
    def classify_intent(query):
        q = (query or '').lower()
        if any(w in q for w in ('why', 'cause', 'caused', 'fix', 'fixed', 'broke', 'error', 'fail', 'reason')):
            return 'causal'
        if any(w in q for w in ('when', 'before', 'after', 'recent', 'last', 'history', 'timeline', 'sequence')):
            return 'temporal'
        if any(w in q for w in ('file', 'module', 'function', 'class', 'symbol', 'package', '.py', '.js')):
            return 'entity'
        return 'semantic'

    def query(self, query, *, views=None, limit=8, hops=2):
        if type(limit) is not int or not 1 <= limit <= 50:
            raise ValueError('limit must be 1–50')
        intent = self.classify_intent(query)
        active_views = list(views) if views else list(dict.fromkeys([intent, 'semantic', 'entity', 'causal', 'temporal']))
        for v in active_views:
            if v not in MAGMA_VIEWS:
                raise ValueError('Unknown MAGMA view: ' + str(v))
        weights = [(i, w) for i, w in enumerate(vector(query)) if w] if query else []
        wanted = _terms(query)
        with closing(self.connect()) as db:
            nodes = {r['id']: r for r in db.execute('SELECT * FROM magma_nodes')}
            edges = db.execute('SELECT * FROM magma_edges').fetchall()
        if not nodes:
            return {'architecture': 'MAGMA', 'intent': intent, 'views': active_views, 'results': [], 'total': 0}

        # Seed scores from lexical-vector + entity overlap
        seeds = []
        for nid, row in nodes.items():
            ents = set(json.loads(row['entities']))
            vec = _from_blob(row['embedding'])
            sim = max(0.0, sum(w * vec[i] for i, w in weights)) if weights else 0.5
            ent_hit = len(wanted & ents) / max(1, len(wanted)) if wanted else 0.0
            base = 0.7 * sim + 0.3 * ent_hit
            if base > 0:
                seeds.append((base, nid))
        seeds.sort(key=lambda x: -x[0])

        # Per-view bounded spreading activation + Reciprocal Rank Fusion (RRF)
        adj = {v: {} for v in MAGMA_VIEWS}
        for e in edges:
            adj[e['view']].setdefault(e['src'], []).append((e['dst'], e['weight']))

        rrf_scores = {}
        view_hits = {}
        k_rrf = 60.0
        for view in active_views:
            activation = {nid: score for score, nid in seeds[:10]}
            frontier = dict(activation)
            for _ in range(max(1, min(3, hops))):
                next_frontier = {}
                for src, val in frontier.items():
                    for dst, w in adj[view].get(src, []):
                        if dst in nodes:
                            boost = val * 0.6 * w
                            if boost > next_frontier.get(dst, 0.0):
                                next_frontier[dst] = boost
                            activation[dst] = max(activation.get(dst, 0.0), boost)
                frontier = next_frontier
            ranked = sorted(activation.items(), key=lambda kv: -kv[1])
            weight_mult = 1.5 if view == intent else 1.0
            for rank, (nid, _) in enumerate(ranked[:limit * 3], start=1):
                rrf_scores[nid] = rrf_scores.get(nid, 0.0) + weight_mult / (k_rrf + rank)
                view_hits.setdefault(nid, []).append(view)

        final = sorted(rrf_scores.items(), key=lambda kv: -kv[1])
        return {
            'architecture': 'MAGMA',
            'intent': intent,
            'views': active_views,
            'results': [{
                'id': nid,
                'kind': nodes[nid]['kind'],
                'content': nodes[nid]['content'],
                'entities': json.loads(nodes[nid]['entities']),
                'matchedViews': sorted(set(view_hits.get(nid, []))),
                'rrfScore': round(score, 5),
                'created': _utc(nodes[nid]['created']),
            } for nid, score in final[:limit]],
            'total': len(final),
        }


# ========================================================================= GAM
class GamMemoryEngine:
    """Dual-module GAM: Memorizer (page store) + Researcher (multi-hop retrieval)."""

    def __init__(self, connect, structmem, eggent, amem, magma, memory_manager=None, clock=time.time):
        self.connect = connect
        self.structmem = structmem
        self.eggent = eggent
        self.amem = amem
        self.magma = magma
        self.memory_manager = memory_manager
        self.clock = clock

    def memorize_page(self, title, body, *, session=None, tags=None, source=None):
        """Memorizer: store a concise abstract + full page in the GAM page store."""
        if not isinstance(body, str) or not body.strip():
            raise ValueError('GAM page body must be nonempty')
        lines = [ln.strip() for ln in body.strip().splitlines() if ln.strip()]
        abstract = ' | '.join(lines[:4])[:400]
        page_id = 'gam_' + uuid.uuid4().hex[:14]
        tags = sorted({str(t).lower() for t in (tags or []) if isinstance(t, str) and t.strip()})[:20]
        now = self.clock()
        with closing(self.connect()) as db, db:
            db.execute('INSERT INTO gam_pages VALUES(?,?,?,?,?,?,?,?)',
                       (page_id, title[:200], abstract, body[:40000], session or '', json.dumps(tags), now, _blob(title + ' ' + abstract + ' ' + body[:2000])))
        return {'id': page_id, 'title': title[:200], 'abstract': abstract}

    def _search_pages(self, query, limit=6):
        weights = [(i, w) for i, w in enumerate(vector(query)) if w] if query else []
        scored = []
        with closing(self.connect()) as db:
            for row in db.execute('SELECT * FROM gam_pages'):
                vec = _from_blob(row['embedding'])
                sim = max(0.0, sum(w * vec[i] for i, w in weights)) if weights else 0.5
                if sim > 0:
                    scored.append((sim, row))
        scored.sort(key=lambda item: (-item[0], -item[1]['created']))
        return [{'id': r['id'], 'title': r['title'], 'abstract': r['abstract'], 'body': r['body'][:1200], 'score': round(s, 4)} for s, r in scored[:limit]]

    def research(self, query, *, max_hops=3, budget_chars=5000, session=None):
        """Researcher: iterative plan -> retrieve -> reflect -> refine loop."""
        if not isinstance(query, str) or not query.strip():
            raise ValueError('Provide a research query')
        if type(max_hops) is not int or not 1 <= max_hops <= 5:
            raise ValueError('max_hops must be 1–5')
        if type(budget_chars) is not int or not 500 <= budget_chars <= 100000:
            raise ValueError('budget_chars must be 500–100000')

        seen_keys = set()
        evidence = []
        hops_log = []
        current_query = query.strip()
        wanted_terms = _terms(query)

        for hop in range(1, max_hops + 1):
            hop_hits = []
            # 1. StructMem
            for rec in self.structmem.query(query=current_query, limit=4)['records']:
                key = ('StructMem', rec['id'])
                if key not in seen_keys:
                    seen_keys.add(key)
                    hop_hits.append({'source': 'StructMem', 'id': rec['id'], 'score': rec['score'],
                                     'text': f"[{rec['schema']}] {rec['subject']} -> {rec['object']} ({json.dumps(rec['data'], ensure_ascii=False)})"})
            # 2. A-MEM
            for note in self.amem.search(current_query, limit=4)['notes']:
                key = ('A-MEM', note['id'])
                if key not in seen_keys:
                    seen_keys.add(key)
                    hop_hits.append({'source': 'A-MEM', 'id': note['id'], 'score': note['score'],
                                     'text': f"{note['context']}: {note['content'][:400]}"})
            # 3. MAGMA
            for item in self.magma.query(current_query, limit=4)['results']:
                key = ('MAGMA', item['id'])
                if key not in seen_keys:
                    seen_keys.add(key)
                    hop_hits.append({'source': 'MAGMA', 'id': item['id'], 'score': item['rrfScore'] * 10,
                                     'text': f"[{','.join(item['matchedViews'])}] {item['content'][:400]}"})
            # 4. egGENT
            for ep in self.eggent.query(current_query, limit=2)['episodes']:
                key = ('egGENT', ep['episodeId'])
                if key not in seen_keys:
                    seen_keys.add(key)
                    hop_hits.append({'source': 'egGENT', 'id': ep['episodeId'], 'score': ep['score'],
                                     'text': f"Episode [{ep['outcome']}] {ep['goal'][:120]} -> {ep['summary'][:240]}"})
            # 5. GAM pages + MemoryManager
            for page in self._search_pages(current_query, limit=3):
                key = ('GAM', page['id'])
                if key not in seen_keys:
                    seen_keys.add(key)
                    hop_hits.append({'source': 'GAM', 'id': page['id'], 'score': page['score'],
                                     'text': f"{page['title']}: {page['abstract']}"})
            if self.memory_manager is not None:
                for item in self.memory_manager.recall(current_query, session=session, limit=4, touch=False)['items']:
                    key = ('MemoryManager', item['id'])
                    if key not in seen_keys:
                        seen_keys.add(key)
                        hop_hits.append({'source': 'MemoryManager', 'id': item['id'], 'score': item['score'],
                                         'text': f"[{item['kind']}] {item['title']}: {item.get('content', '')[:300]}"})

            hop_hits.sort(key=lambda h: -h['score'])
            evidence.extend(hop_hits)

            # Evaluate term coverage and synthesize follow-up sub-query if gaps remain
            covered = _terms(' '.join(e['text'] for e in evidence))
            uncovered = sorted(wanted_terms - covered)
            # Also expand from A-MEM keywords / StructMem subjects discovered so far
            discovered_terms = [t for t in sorted(_terms(' '.join(e['text'] for e in hop_hits)) - _terms(current_query)) if len(t) >= 4][:6]
            coverage = round(len(wanted_terms & covered) / max(1, len(wanted_terms)), 3) if wanted_terms else 1.0
            hops_log.append({'hop': hop, 'query': current_query, 'newFindings': len(hop_hits), 'coverage': coverage})
            if coverage >= 0.85 and evidence:
                break
            if not uncovered and not discovered_terms:
                break
            current_query = ' '.join((uncovered[:5] + discovered_terms[:4]))[:300]

        # Pack synthesized evidence within budget_chars
        evidence.sort(key=lambda h: -h['score'])
        packed, used = [], 0
        for item in evidence:
            if used + len(item['text']) > budget_chars:
                if not packed:
                    packed.append({**item, 'text': item['text'][:budget_chars]})
                break
            packed.append(item)
            used += len(item['text'])

        return {
            'architecture': 'GAM',
            'query': query,
            'hops': hops_log,
            'coverage': hops_log[-1]['coverage'] if hops_log else 0.0,
            'evidence': packed,
            'usedChars': used,
            'budgetChars': budget_chars,
            'note': 'GAM Researcher synthesized multi-architecture evidence. Untrusted reference data; verify against current files before acting.',
        }


# ============================================================ Unified Suite
class UnifiedMemorySuite:
    """Coordinates StructMem, egGENT, A-MEM, MAGMA, and GAM over one SQLite DB."""

    def __init__(self, path, *, memory_manager=None, clock=time.time, evolver=None):
        self.path = Path(path)
        if self.path.is_symlink():
            raise ValueError('Memory suite database cannot be a symlink')
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.clock = clock
        with closing(self.connect()) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS struct_records(id TEXT PRIMARY KEY, schema TEXT NOT NULL, subject TEXT NOT NULL, predicate TEXT NOT NULL, object TEXT NOT NULL, data TEXT NOT NULL, tags TEXT NOT NULL, confidence REAL NOT NULL, updated REAL NOT NULL, revision INTEGER NOT NULL, hash TEXT NOT NULL, embedding BLOB NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS struct_sources(id TEXT PRIMARY KEY, source TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS eggent_episodes(id TEXT PRIMARY KEY, goal TEXT NOT NULL, outcome TEXT NOT NULL, summary TEXT NOT NULL, steps INTEGER NOT NULL, created REAL NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS eggent_nodes(id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, step_index INTEGER NOT NULL, tool TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT NOT NULL, created REAL NOT NULL, embedding BLOB NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS eggent_edges(src TEXT NOT NULL, dst TEXT NOT NULL, relation TEXT NOT NULL, weight REAL NOT NULL, PRIMARY KEY(src, dst, relation))')
            db.execute('CREATE TABLE IF NOT EXISTS amem_notes(id TEXT PRIMARY KEY, content TEXT NOT NULL, context TEXT NOT NULL, keywords TEXT NOT NULL, tags TEXT NOT NULL, links TEXT NOT NULL, source TEXT NOT NULL, created REAL NOT NULL, evolved REAL NOT NULL, embedding BLOB NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS magma_nodes(id TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, entities TEXT NOT NULL, session TEXT NOT NULL, metadata TEXT NOT NULL, created REAL NOT NULL, embedding BLOB NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS magma_edges(src TEXT NOT NULL, dst TEXT NOT NULL, view TEXT NOT NULL, weight REAL NOT NULL, PRIMARY KEY(src, dst, view))')
            db.execute('CREATE TABLE IF NOT EXISTS gam_pages(id TEXT PRIMARY KEY, title TEXT NOT NULL, abstract TEXT NOT NULL, body TEXT NOT NULL, session TEXT NOT NULL, tags TEXT NOT NULL, created REAL NOT NULL, embedding BLOB NOT NULL)')
        try:
            self.path.chmod(0o600)
        except OSError:
            pass
        self.structmem = StructMemStore(self.connect, clock=clock)
        self.eggent = EggentEpisodicGraph(self.connect, clock=clock)
        self.amem = AMemNetwork(self.connect, clock=clock, evolver=evolver)
        self.magma = MagmaMultiGraph(self.connect, clock=clock)
        self.gam = GamMemoryEngine(self.connect, self.structmem, self.eggent, self.amem, self.magma, memory_manager=memory_manager, clock=clock)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        return db

    def ingest_session(self, session):
        """Populate egGENT, StructMem, A-MEM, MAGMA, and GAM from a finished session."""
        sid = session['id']
        events = session.get('events') or []
        ep = self.eggent.record_episode(session)
        completion = next((e['value'] for e in reversed(events) if e['kind'] == 'completion'), {})
        goal = session.get('goal', '')
        summary = str(completion.get('summary', ''))
        outcome = completion.get('outcome') or session.get('status') or 'paused'

        # Extract touched files & failure->fix pairs for StructMem + MAGMA causal links
        actions, failures, touched = {}, [], set()
        last_fail_magma = None
        for ev in events:
            val = ev.get('value') or {}
            if ev['kind'] == 'action' and val.get('id'):
                actions[val['id']] = val
            elif ev['kind'] == 'observation' and not val.get('parentCallId'):
                tool = val.get('tool')
                args = (actions.get(val.get('id')) or {}).get('args') or {}
                path = args.get('path')
                if path and val.get('ok'):
                    touched.add(path)
                res = val.get('result') or {}
                failed = val.get('ok') is False or bool(res.get('timedOut')) or (isinstance(res.get('exitCode'), int) and res['exitCode'] != 0)
                sig = (tool, str(path or args.get('command') or ''))
                if failed:
                    err = str(val.get('error') or res.get('exitCode') or 'failed')[:200]
                    failures.append({'sig': sig, 'err': err, 'resolved': False})
                    mg = self.magma.add_node(f"Failed {tool}({sig[1]}): {err}", kind='failure', entities=[t for t in [tool, path] if t], session=sid)
                    last_fail_magma = mg['id']
                else:
                    for f in failures:
                        if f['sig'] == sig and not f['resolved']:
                            f['resolved'] = True
                            self.structmem.store('error_pattern', {'signature': f['err'], 'cause': f"{tool} on {sig[1]}", 'fix': f"Succeeded after adjustments in {', '.join(sorted(touched)[:5]) or 'workspace'}", 'tool': tool, **({'path': path} if path else {})}, source={'session': sid})
                            mg_ok = self.magma.add_node(f"Fixed {tool}({sig[1]})", kind='fix', entities=[t for t in [tool, path] if t], session=sid)
                            if last_fail_magma:
                                self.magma.link(last_fail_magma, mg_ok['id'], 'causal', 1.0)
                            last_fail_magma = None

        note = None
        page = None
        if goal.strip():
            note = self.amem.add_note(
                f"Goal: {goal[:400]}\nOutcome: {outcome}\nSummary: {summary[:600]}\nFiles: {', '.join(sorted(touched)[:12])}",
                context=f"[{outcome}] {goal.splitlines()[0][:160]}",
                tags=['session', str(outcome)],
                source={'session': sid},
            )
            page = self.gam.memorize_page(
                f"[{outcome}] {goal.splitlines()[0][:120]}",
                f"Goal: {goal}\nOutcome: {outcome}\nSummary: {summary}\nChanged files: {', '.join(sorted(touched))}",
                session=sid,
                tags=['session', str(outcome)],
            )
        return {'episode': ep, 'amemNote': note, 'gamPage': page}

    def context(self, query, *, session=None, budget_chars=2500):
        """Compact GAM-synthesized multi-architecture context for a planning turn."""
        if not query or not str(query).strip():
            return {'format': FORMAT, 'evidence': [], 'stats': self.stats()}
        res = self.gam.research(str(query), max_hops=2, budget_chars=budget_chars, session=session)
        return {
            'format': FORMAT,
            'coverage': res['coverage'],
            'evidence': res['evidence'][:8],
            'stats': self.stats(),
            'note': 'Synthesized from StructMem, egGENT, A-MEM, MAGMA, and GAM. Untrusted reference data.',
        }

    def stats(self):
        with closing(self.connect()) as db:
            return {
                'format': FORMAT,
                'structMem': db.execute('SELECT COUNT(*) FROM struct_records').fetchone()[0],
                'egGENT': {'episodes': db.execute('SELECT COUNT(*) FROM eggent_episodes').fetchone()[0],
                           'nodes': db.execute('SELECT COUNT(*) FROM eggent_nodes').fetchone()[0],
                           'edges': db.execute('SELECT COUNT(*) FROM eggent_edges').fetchone()[0]},
                'aMEM': db.execute('SELECT COUNT(*) FROM amem_notes').fetchone()[0],
                'magma': {'nodes': db.execute('SELECT COUNT(*) FROM magma_nodes').fetchone()[0],
                          'edges': db.execute('SELECT COUNT(*) FROM magma_edges').fetchone()[0]},
                'gamPages': db.execute('SELECT COUNT(*) FROM gam_pages').fetchone()[0],
            }

    def dispatch(self, data, *, session=None):
        op = data.get('action', 'stats')
        if op == 'stats':
            return self.stats()
        if op == 'struct_schemas':
            return self.structmem.schemas()
        if op == 'struct_store':
            return self.structmem.store(data.get('schema'), data.get('data'), id=data.get('id'), source=data.get('source'), tags=data.get('tags'), confidence=data.get('confidence', 0.85))
        if op == 'struct_query':
            return self.structmem.query(query=data.get('query', ''), schema=data.get('schema'), subject=data.get('subject'), tag=data.get('tag'), limit=data.get('limit', 12))
        if op == 'struct_get':
            return self.structmem.get(data.get('id'))
        if op == 'struct_delete':
            return self.structmem.delete(data.get('id'))
        if op == 'eggent_query':
            return self.eggent.query(data.get('query', ''), outcome=data.get('outcome'), limit=data.get('limit', 8))
        if op == 'amem_add':
            return self.amem.add_note(data.get('content', ''), context=data.get('context', ''), tags=data.get('tags'), keywords=data.get('keywords'), source=data.get('source'), top_k=data.get('topK', 5))
        if op == 'amem_search':
            return self.amem.search(data.get('query', ''), limit=data.get('limit', 8), expand_links=data.get('expandLinks', True))
        if op == 'amem_list':
            with closing(self.connect()) as db:
                rows = db.execute('SELECT id, context, content, keywords, tags, links, created, evolved FROM amem_notes ORDER BY evolved DESC LIMIT ?', (int(data.get('limit', 50)),)).fetchall()
            return {'notes': [{'id': r['id'], 'context': r['context'], 'content': r['content'], 'keywords': json.loads(r['keywords']), 'tags': json.loads(r['tags']), 'links': json.loads(r['links']), 'created': _utc(r['created']), 'evolved': _utc(r['evolved'])} for r in rows]}
        if op == 'amem_delete':
            with closing(self.connect()) as db, db:
                deleted = db.execute('DELETE FROM amem_notes WHERE id=?', (data.get('id'),)).rowcount
            return {'id': data.get('id'), 'deleted': bool(deleted)}
        if op == 'magma_add':
            return self.magma.add_node(data.get('content', ''), kind=data.get('kind', 'observation'), entities=data.get('entities'), session=data.get('session') or (session['id'] if session else None), id=data.get('id'), metadata=data.get('metadata'))
        if op == 'magma_link':
            return self.magma.link(data.get('src'), data.get('dst'), data.get('view'), data.get('weight', 1.0))
        if op == 'magma_query':
            return self.magma.query(data.get('query', ''), views=data.get('views'), limit=data.get('limit', 8), hops=data.get('hops', 2))
        if op == 'magma_list':
            with closing(self.connect()) as db:
                nodes = db.execute('SELECT id, kind, content, entities, session, created FROM magma_nodes ORDER BY created DESC LIMIT ?', (int(data.get('limit', 50)),)).fetchall()
                edges = db.execute('SELECT COUNT(*) FROM magma_edges').fetchone()[0]
            return {'nodes': [{'id': r['id'], 'kind': r['kind'], 'content': r['content'], 'entities': json.loads(r['entities']), 'session': r['session'], 'created': _utc(r['created'])} for r in nodes], 'totalEdges': edges}
        if op == 'magma_delete':
            with closing(self.connect()) as db, db:
                db.execute('DELETE FROM magma_edges WHERE src=? OR dst=?', (data.get('id'), data.get('id')))
                deleted = db.execute('DELETE FROM magma_nodes WHERE id=?', (data.get('id'),)).rowcount
            return {'id': data.get('id'), 'deleted': bool(deleted)}
        if op == 'gam_memorize':
            return self.gam.memorize_page(data.get('title', 'Note'), data.get('body', ''), session=data.get('session') or (session['id'] if session else None), tags=data.get('tags'))
        if op == 'gam_list':
            with closing(self.connect()) as db:
                rows = db.execute('SELECT id, title, abstract, body, session, tags, created FROM gam_pages ORDER BY created DESC LIMIT ?', (int(data.get('limit', 50)),)).fetchall()
            return {'pages': [{'id': r['id'], 'title': r['title'], 'abstract': r['abstract'], 'body': r['body'], 'session': r['session'], 'tags': json.loads(r['tags']), 'created': _utc(r['created'])} for r in rows]}
        if op == 'gam_delete':
            with closing(self.connect()) as db, db:
                deleted = db.execute('DELETE FROM gam_pages WHERE id=?', (data.get('id'),)).rowcount
            return {'id': data.get('id'), 'deleted': bool(deleted)}
        if op == 'gam_research':
            return self.gam.research(data.get('query', ''), max_hops=data.get('maxHops', 3), budget_chars=data.get('budgetChars', 5000), session=session['id'] if session else data.get('session'))
        if op == 'ingest_session' and session is not None:
            return self.ingest_session(session)
        raise ValueError('Unsupported memory_suite action')
