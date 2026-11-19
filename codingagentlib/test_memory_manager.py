import tempfile
import unittest
from pathlib import Path

from codingagentlib import MemoryManager, Runtime


class MemoryManagerTests(unittest.TestCase):
    def test_layered_memory_dedup_decay_consolidation_and_scratchpad(self):
        clock_time = [1_700_000_000.0]
        with tempfile.TemporaryDirectory() as tmp:
            mgr = MemoryManager(Path(tmp) / 'mem.sqlite3', max_items=15, clock=lambda: clock_time[0])
            r1 = mgr.remember('Use pytest -q to run unit tests in this repo.', kind='procedure', tags=['testing', 'pytest'], importance=0.9, pinned=True)
            self.assertFalse(r1['merged'])
            # Exact duplicate merges
            r2 = mgr.remember('Use pytest -q to run unit tests in this repo.', kind='procedure', tags=['ci'], importance=0.5)
            self.assertTrue(r2['merged'])
            self.assertEqual(r2['id'], r1['id'])
            # Near duplicate merges
            r3 = mgr.remember('Use pytest -q to run unit tests in this repo!', kind='procedure', tags=['fast'], importance=0.8)
            self.assertTrue(r3['merged'])
            # TTL expiry
            mgr.remember('Temporary token cache detail', kind='note', ttl_days=1)
            clock_time[0] += 2 * 86400
            report = mgr.consolidate()
            self.assertEqual(report['expired'], 1)

            # Capacity pruning keeps pinned items
            for i in range(25):
                mgr.remember(f'Unique workspace fact number {i} about module_{i}_alpha_{i * 17}', kind='fact', importance=0.2 + (i % 5) * 0.1)
            stats = mgr.stats()
            self.assertLessEqual(stats['items'], 15)
            self.assertEqual(mgr.read(r1['id'])['pinned'], True)

            # Scratchpad
            mgr.scratch_set('a' * 32, 'plan', 'Step 1')
            mgr.scratch_set('a' * 32, 'plan', 'Step 2', append=True)
            self.assertIn('Step 2', mgr.scratch_get('a' * 32, 'plan')['value'])
            snap = mgr.scratch_snapshot('a' * 32)
            self.assertIn('plan', snap)

    def test_runtime_memory_tools_turn_recall_and_auto_episode(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'app.py').write_text('x = 1\n', encoding='utf-8')
            runtime = Runtime(ws)
            try:
                s1 = runtime.start({'goal': 'Fix parser bug', 'allowEdits': True, 'allowCommands': False})
                sid = s1['id']
                sess = runtime.get(sid)
                res = runtime.tool(sess, 'memory_remember', {
                    'content': 'Parser fails on empty trailing commas in config.json',
                    'kind': 'lesson',
                    'tags': ['parser', 'config'],
                    'importance': 0.85,
                }, 'm1', enforce_plan=False)
                self.assertTrue(res['ok'])

                runtime.tool(sess, 'scratchpad', {'action': 'set', 'key': 'focus', 'value': 'app.py'}, 'm2', enforce_plan=False)
                turn = runtime.dispatch({'op': 'turn', 'session': sid})
                self.assertIn('agentMemory', turn)
                self.assertTrue(any('trailing commas' in item['content'] for item in turn['agentMemory']['items']))
                self.assertEqual(turn['agentMemory']['scratchpad']['focus'], 'app.py')

                runtime.dispatch({'op': 'finish', 'session': sid, 'outcome': 'complete', 'summary': 'Fixed parser'})
                episodes = runtime.agent_memory.recall('Fix parser bug', kinds=['episode'])
                self.assertGreaterEqual(len(episodes['items']), 1)
                self.assertIn('Fixed parser', episodes['items'][0]['content'])
            finally:
                runtime.close()


if __name__ == '__main__':
    unittest.main()
