import sys
import tempfile
import unittest
from pathlib import Path

from codingagentlib import ReactAgent, Runtime, UnifiedMemorySuite


class MemoryArchitecturesTests(unittest.TestCase):
    def test_structmem_eggent_amem_magma_gam(self):
        with tempfile.TemporaryDirectory() as tmp:
            suite = UnifiedMemorySuite(Path(tmp) / 'suite.sqlite3')

            # 1. StructMem: schema validation, dedup, attribute & query search
            with self.assertRaises(ValueError):
                suite.structmem.store('api_contract', {'name': 'login'})  # missing signature
            s1 = suite.structmem.store('api_contract', {
                'name': 'verify_token',
                'signature': 'verify_token(token: str) -> Claims',
                'path': 'auth/jwt.py',
            }, tags=['auth', 'jwt'])
            s1_dup = suite.structmem.store('api_contract', {
                'name': 'verify_token',
                'signature': 'verify_token(token: str) -> Claims',
                'path': 'auth/jwt.py',
            }, tags=['auth', 'jwt'])
            self.assertTrue(s1_dup['deduplicated'])
            self.assertEqual(s1['id'], s1_dup['id'])
            found_struct = suite.structmem.query(query='verify_token jwt', schema='api_contract')
            self.assertEqual(found_struct['records'][0]['subject'], 'verify_token')

            # 2. egGENT: episodic trajectory with PRECEDES & RESOLVED_BY transitions
            ep = suite.eggent.record_episode({
                'id': 'a' * 32,
                'goal': 'Fix JWT expiry check in auth/jwt.py',
                'status': 'complete',
                'events': [
                    {'index': 0, 'kind': 'action', 'value': {'id': 'c1', 'tool': 'run_command', 'args': {'command': 'pytest'}}},
                    {'index': 1, 'kind': 'observation', 'value': {'id': 'c1', 'tool': 'run_command', 'ok': False, 'error': 'AssertionError: expired token accepted', 'result': {'exitCode': 1}}},
                    {'index': 2, 'kind': 'action', 'value': {'id': 'c2', 'tool': 'apply_edits', 'args': {'path': 'auth/jwt.py'}}},
                    {'index': 3, 'kind': 'observation', 'value': {'id': 'c2', 'tool': 'apply_edits', 'ok': True, 'result': {'path': 'auth/jwt.py'}}},
                    {'index': 4, 'kind': 'action', 'value': {'id': 'c3', 'tool': 'run_command', 'args': {'command': 'pytest'}}},
                    {'index': 5, 'kind': 'observation', 'value': {'id': 'c3', 'tool': 'run_command', 'ok': True, 'result': {'exitCode': 0}}},
                    {'index': 6, 'kind': 'completion', 'value': {'outcome': 'complete', 'summary': 'Fixed JWT expiry validation'}},
                ],
            })
            self.assertEqual(ep['steps'], 3)
            eg_res = suite.eggent.query('JWT expiry check')
            self.assertEqual(len(eg_res['episodes']), 1)
            self.assertTrue(any(t['relation'] == 'RESOLVED_BY' for t in eg_res['episodes'][0]['transitions']))

            # 3. A-MEM: Zettelkasten atomic notes, bidirectional linking & evolution
            n1 = suite.amem.add_note(
                'JWT token validation in auth/jwt.py checks exp claim against UTC clock.',
                context='JWT validation rules',
                tags=['auth', 'jwt'],
            )
            n2 = suite.amem.add_note(
                'Clock skew tolerance for JWT exp claim in auth/jwt.py is 30 seconds.',
                context='JWT clock skew policy',
                tags=['auth', 'clock-skew'],
            )
            self.assertTrue(any(link['id'] == n1['id'] for link in n2['links']))
            self.assertIn(n1['id'], n2['evolvedNeighbors'])
            am_res = suite.amem.search('JWT exp claim', expand_links=True)
            self.assertGreaterEqual(len(am_res['notes']), 2)
            self.assertTrue(any(n['links'] for n in am_res['notes']))

            # 4. MAGMA: 4-view multi-graph (semantic, temporal, causal, entity) + RRF
            m_fail = suite.magma.add_node('Test failed: JWT exp claim ignored in auth/jwt.py', kind='failure', entities=['auth/jwt.py', 'jwt'], session='s1')
            m_fix = suite.magma.add_node('Added UTC exp check in auth/jwt.py', kind='fix', entities=['auth/jwt.py', 'jwt'], session='s1')
            suite.magma.link(m_fail['id'], m_fix['id'], 'causal', 1.0)
            mg_res = suite.magma.query('Why did jwt auth/jwt.py fail and what fixed it?')
            self.assertEqual(mg_res['intent'], 'causal')
            self.assertGreaterEqual(len(mg_res['results']), 2)
            self.assertTrue(any('causal' in r['matchedViews'] for r in mg_res['results']))

            # 5. GAM: Memorizer page store + Researcher multi-hop synthesis
            suite.gam.memorize_page('Auth architecture', 'auth/jwt.py enforces RS256 signatures and 30s clock skew.', tags=['auth'])
            gam_res = suite.gam.research('How does auth/jwt.py validate JWT expiry and clock skew?', max_hops=3, budget_chars=4000)
            self.assertGreaterEqual(len(gam_res['hops']), 1)
            self.assertGreater(gam_res['coverage'], 0.4)
            sources = {e['source'] for e in gam_res['evidence']}
            self.assertTrue(sources & {'StructMem', 'A-MEM', 'MAGMA', 'egGENT', 'GAM'})

    def test_runtime_and_react_integration(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'mod.py').write_text('VALUE = 42\n', encoding='utf-8')
            runtime = Runtime(ws, [sys.executable, 'python3'])
            try:
                sess = runtime.start({'goal': 'Document mod.py contract and run check', 'allowEdits': True, 'allowCommands': True})
                sid = sess['id']
                s = runtime.get(sid)

                r_struct = runtime.tool(s, 'memory_struct', {
                    'action': 'store',
                    'schema': 'file_summary',
                    'data': {'path': 'mod.py', 'purpose': 'Exports constant VALUE=42'},
                    'tags': ['mod'],
                }, 't1', enforce_plan=False)
                self.assertTrue(r_struct['ok'])

                r_graph = runtime.tool(s, 'memory_graph', {
                    'action': 'amem_add',
                    'content': 'mod.py provides VALUE=42 for downstream calculations',
                    'tags': ['mod'],
                }, 't2', enforce_plan=False)
                self.assertTrue(r_graph['ok'])

                r_res = runtime.tool(s, 'memory_research', {
                    'action': 'research',
                    'query': 'What does mod.py export?',
                }, 't3', enforce_plan=False)
                self.assertTrue(r_res['ok'])
                self.assertGreaterEqual(len(r_res['result']['evidence']), 1)

                turn = runtime.dispatch({'op': 'turn', 'session': sid})
                self.assertIn('architectures', turn['agentMemory'])
                self.assertGreaterEqual(len(turn['agentMemory']['architectures']['evidence']), 1)

                runtime.dispatch({'op': 'finish', 'session': sid, 'outcome': 'complete', 'summary': 'Documented mod.py'})
                stats = runtime.dispatch({'op': 'memory_suite', 'action': 'stats'})
                self.assertGreaterEqual(stats['structMem'], 1)
                self.assertGreaterEqual(stats['egGENT']['episodes'], 1)
                self.assertGreaterEqual(stats['aMEM'], 1)
                self.assertGreaterEqual(stats['gamPages'], 1)
            finally:
                runtime.close()


if __name__ == '__main__':
    unittest.main()
