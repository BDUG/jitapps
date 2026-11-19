import sys
import tempfile
import unittest
from pathlib import Path

from codingagentlib import (
    AgentlessPipeline,
    CodeActAgent,
    END,
    MultiAgentOrchestrator,
    PlannerExecutorAgent,
    ReflexionLoop,
    Runtime,
    StateGraph,
    TreeSearchAgent,
)


class BeyondReactTests(unittest.TestCase):
    def test_tree_search_mcts_backtracks_to_best_branch(self):
        with tempfile.TemporaryDirectory() as ws:
            target = Path(ws) / 'val.txt'
            target.write_text('0', encoding='utf-8')
            with TreeSearchAgent(ws, branch_factor=2, max_depth=2) as ts:
                def proposer(state, k):
                    if state['depth'] == 0:
                        return [
                            {'tool': 'write_file', 'args': {'path': 'val.txt', 'content': 'bad', 'expectedHash': 'missing'}},
                            {'tool': 'write_file', 'args': {'path': 'val.txt', 'content': 'good', 'expectedHash': 'missing'}},
                        ]
                    return {'status': 'done', 'summary': 'Selected best branch'}

                def evaluator(node, runtime, session):
                    txt = (Path(runtime.root) / 'val.txt').read_text(encoding='utf-8')
                    return 1.0 if txt == 'good' else 0.0

                # Wait: val.txt already exists, so expectedHash='missing' would fail; read current hash first
                h = ts.runtime.tool(ts.runtime.get(ts.runtime.start({'goal': 'h'})['id']), 'read_file', {'path': 'val.txt'}, 'r0', enforce_plan=False)['result']['hash']
                def proposer2(state, k):
                    if state['depth'] == 0:
                        return [
                            {'tool': 'write_file', 'args': {'path': 'val.txt', 'content': 'bad', 'expectedHash': h}},
                            {'tool': 'write_file', 'args': {'path': 'val.txt', 'content': 'good', 'expectedHash': h}},
                        ]
                    return {'status': 'done', 'summary': 'Done'}

                res = ts.search('Pick good value', proposer2, evaluator=evaluator, max_simulations=3)
                self.assertEqual(res['bestReward'], 1.0)
                self.assertEqual(target.read_text(encoding='utf-8'), 'good')

    def test_codeact_persistent_repl_across_turns(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'data.txt').write_text('10\n20\n30\n', encoding='utf-8')
            with CodeActAgent(ws, [sys.executable, 'python3']) as ca:
                def model(req):
                    if req['step'] == 1:
                        return '```python\nnums = [int(x) for x in open("data.txt").read().splitlines()]\nprint("loaded", len(nums))\n```'
                    if req['step'] == 2:
                        # Relies on `nums` persisting in the REPL from step 1
                        return '```python\ntotal = sum(nums)\nopen("out.txt", "w").write(str(total))\nprint("total", total)\n```'
                    return {'done': True, 'code': '', 'summary': 'Computed sum=60'}

                res = ca.run('Sum numbers', model, max_steps=5)
                self.assertEqual(res['status'], 'complete')
                self.assertEqual((Path(ws) / 'out.txt').read_text(encoding='utf-8'), '60')

    def test_agentless_pipeline_and_sdd_gate(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'calc.py').write_text('def add(a, b):\n    return a - b\n', encoding='utf-8')
            (Path(ws) / 'test_calc.py').write_text('import calc\nassert calc.add(2, 3) == 5\n', encoding='utf-8')

            with AgentlessPipeline(ws, [sys.executable, 'python3']) as pipe:
                res = pipe.run(
                    'Fix add()',
                    localizer=lambda ctx: ['calc.py'],
                    patcher=lambda ctx: [
                        {'summary': 'Wrong fix', 'edits': [{'path': 'calc.py', 'edits': [{'find': 'a - b', 'replacement': 'a * b'}]}]},
                        {'summary': 'Right fix', 'edits': [{'path': 'calc.py', 'edits': [{'find': 'a - b', 'replacement': 'a + b'}]}]},
                    ],
                    test_command={'command': sys.executable, 'args': ['test_calc.py']},
                )
                self.assertTrue(res['passed'])
                self.assertEqual(res['selectedIndex'], 1)
                self.assertIn('a + b', (Path(ws) / 'calc.py').read_text(encoding='utf-8'))

            # Runtime-enforced SDD gate
            rt = Runtime(ws)
            try:
                sid = rt.start({'goal': 'Edit with SDD', 'allowEdits': True, 'requireSpec': True})['id']
                s = rt.get(sid)
                blocked = rt.tool(s, 'write_file', {'path': 'new.txt', 'content': 'hi', 'expectedHash': 'missing'}, 'sdd1', enforce_plan=False)
                self.assertFalse(blocked['ok'])
                self.assertIn('Spec-Driven Development gate', blocked['error'])
                rt.dispatch({'op': 'approve_spec', 'session': sid, 'spec': 'Create new.txt with hi'})
                allowed = rt.tool(s, 'write_file', {'path': 'new.txt', 'content': 'hi', 'expectedHash': 'missing'}, 'sdd2', enforce_plan=False)
                self.assertTrue(allowed['ok'])
            finally:
                rt.close()

    def test_state_graph_planner_executor_multi_agent_and_reflexion(self):
        # 1. Cyclical StateGraph: code -> test -> code -> test -> END
        g = StateGraph(max_transitions=10)
        g.add_node('code', lambda st: {'attempt': st['attempt'] + 1, 'passed': st['attempt'] + 1 >= 2})
        g.add_node('test', lambda st: {'tested': True})
        g.set_entry('code')
        g.add_edge('code', 'test')
        g.add_conditional_edges('test', lambda st: END if st['passed'] else 'code')
        g_res = g.run({'attempt': 0, 'passed': False})
        self.assertEqual(g_res['status'], 'complete')
        self.assertEqual(g_res['state']['attempt'], 2)

        # 2. PlannerExecutorAgent
        with tempfile.TemporaryDirectory() as ws:
            pe = PlannerExecutorAgent(
                ws,
                planner_model=lambda req: {'tasks': [{'id': 't1', 'title': 'Create note.txt', 'status': 'pending'}]},
                executor_model=lambda req: (
                    {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Write', 'action': {'tool': 'write_file', 'args': {'path': 'note.txt', 'content': 'ok', 'expectedHash': 'missing'}}}
                    if req['step'] == 1 else
                    {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'outcome': 'complete', 'summary': 'Wrote note.txt'}
                ),
            )
            pe_res = pe.run('Create note.txt', allow_commands=False)
            self.assertEqual(pe_res['status'], 'complete')
            self.assertTrue((Path(ws) / 'note.txt').exists())

        # 3. MultiAgentOrchestrator (isolated Coder + Tester + Reviewer -> merge)
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'app.txt').write_text('v1', encoding='utf-8')
            orch = MultiAgentOrchestrator(ws, [sys.executable, 'python3'])
            m_res = orch.run(
                'Create out.txt',
                searcher=lambda req: {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Found app.txt', 'action': None, 'outcome': 'complete', 'summary': 'app.txt exists'},
                coder=lambda req: (
                    {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Write out.txt', 'action': {'tool': 'write_file', 'args': {'path': 'out.txt', 'content': 'verified', 'expectedHash': 'missing'}}}
                    if req['step'] == 1 else
                    {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'outcome': 'complete', 'summary': 'Created out.txt'}
                ),
                tester=lambda req: (
                    {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Read out.txt', 'action': {'tool': 'read_file', 'args': {'path': 'out.txt'}}}
                    if req['step'] == 1 else
                    {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Verified', 'action': None, 'outcome': 'complete', 'summary': 'Verified out.txt'}
                ),
                reviewer=lambda info: {'approved': 'out.txt' in [c['path'] for c in info['changes']], 'summary': 'Looks good'},
            )
            self.assertEqual(m_res['status'], 'complete')
            self.assertEqual((Path(ws) / 'out.txt').read_text(encoding='utf-8'), 'verified')

        # 4. ReflexionLoop: enforces reflection on failure and stores lesson immediately
        with tempfile.TemporaryDirectory() as ws:
            with ReflexionLoop(ws) as rl:
                def model(req):
                    if req['step'] == 1:
                        return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Read missing', 'action': {'tool': 'read_file', 'args': {'path': 'missing.txt'}}}
                    if req.get('reflexionRequired'):
                        cid = req['reflexionRequired']['failedCallId']
                        return {
                            'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Write instead',
                            'reflection': {'observation': 'missing.txt did not exist', 'adjustment': 'Create missing.txt first', 'evidenceIds': [cid]},
                            'action': {'tool': 'write_file', 'args': {'path': 'missing.txt', 'content': 'created', 'expectedHash': 'missing'}},
                        }
                    return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'outcome': 'complete', 'summary': 'Created missing.txt'}

                r_res = rl.run('Ensure missing.txt', model, allow_commands=False)
                self.assertEqual(r_res['status'], 'complete')
                self.assertEqual(len(r_res['reflections']), 1)


if __name__ == '__main__':
    unittest.main()
