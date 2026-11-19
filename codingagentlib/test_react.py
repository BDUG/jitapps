import json
import sys
import tempfile
import unittest
from pathlib import Path

from codingagentlib import ReactAgent


class ReactAgentTests(unittest.TestCase):
    def test_react_multi_action_memory_and_verification(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'greet.py').write_text('def greet():\n    return "hi"\n', encoding='utf-8')
            calls = []

            def model(req):
                calls.append(req)
                step = req['step']
                if step == 1:
                    # Multi-action batch: write a test script, run it via script_run, and remember a fact
                    return {
                        'sessionId': req['sessionId'],
                        'step': step,
                        'status': 'act',
                        'plan': 'Create and run verification script and record fact',
                        'actions': [
                            {'tool': 'memory_remember', 'args': {'content': 'greet.py defines greet()', 'kind': 'fact', 'tags': ['greet']}},
                            {'tool': 'script_run', 'args': {'source': 'import greet, agent_io\nassert greet.greet() == "hi"\nagent_io.emit({"ok": True})\n', 'filename': 'verify_greet.py'}},
                        ],
                    }
                return {
                    'sessionId': req['sessionId'],
                    'step': step,
                    'status': 'done',
                    'plan': 'Verified greet() via script_run',
                    'action': None,
                    'outcome': 'complete',
                    'summary': 'Verified greet() returns hi',
                    'verification': ['script_run verify_greet.py exited 0'],
                }

            with ReactAgent(ws, [sys.executable, 'python3'], max_context_events=4, keep_recent_events=2) as agent:
                result = agent.run('Verify greet.py', model, allow_edits=True, allow_commands=True)
                self.assertEqual(result['status'], 'complete')
                self.assertEqual(result['modelCalls'], 2)
                self.assertEqual(result['steps'], 3)
                # Second model call saw agentMemory + workingBrief
                self.assertIn('agentMemory', calls[1])
                self.assertIn('workingBrief', calls[1])
                self.assertIn('decisionGuidance', calls[1])

    def test_react_loop_detection_and_repair(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'a.txt').write_text('hello', encoding='utf-8')
            saw_loop = []
            saw_repair = []

            def model(req):
                if req.get('repairHint'):
                    saw_repair.append(req['repairHint'])
                if req.get('loopWarning'):
                    saw_loop.append(req['loopWarning'])
                    return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Stop after loop warning', 'action': None, 'outcome': 'partial', 'summary': 'Stopped on loop'}
                if req['step'] == 1:
                    return 'not valid json at all'
                return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Read a.txt', 'action': {'tool': 'read_file', 'args': {'path': 'a.txt'}}}

            with ReactAgent(ws) as agent:
                result = agent.run('Test repair and loop detection', model, max_steps=10)
                self.assertEqual(result['status'], 'complete')
                self.assertEqual(result['outcome'], 'partial')
                self.assertTrue(saw_repair)
                self.assertTrue(saw_loop)

    def test_remember_previous_sessions_default_and_opt_out(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'x.py').write_text('x = 1\n', encoding='utf-8')
            with ReactAgent(ws) as agent:
                # Session 1: remembered by default
                r1 = agent.run(
                    'Inspect x.py',
                    lambda req: {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'outcome': 'complete', 'summary': 'Inspected x.py successfully'},
                )
                self.assertEqual(r1['status'], 'complete')

                # Session 2 (default remember_sessions=True): sees previous session on step 1
                seen_default = []

                def model2(req):
                    seen_default.append(req)
                    return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'outcome': 'complete', 'summary': 'Second run complete'}

                r2 = agent.run('Follow up on x.py', model2)
                self.assertEqual(r2['status'], 'complete')
                mem = seen_default[0]['agentMemory']
                self.assertTrue(mem['rememberSessions'])
                self.assertTrue(any(s['id'] == r1['sessionId'] for s in mem['previousSessions']))

                # Session 3 (remember_sessions=False): does not recall previous sessions and does not persist itself
                seen_disabled = []

                def model3(req):
                    seen_disabled.append(req)
                    return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'outcome': 'complete', 'summary': 'Private session secret'}

                r3 = agent.run('Private task', model3, remember_sessions=False)
                self.assertEqual(r3['status'], 'complete')
                self.assertFalse(seen_disabled[0]['agentMemory']['rememberSessions'])
                self.assertEqual(seen_disabled[0]['agentMemory']['previousSessions'], [])
                self.assertEqual(seen_disabled[0]['agentMemory']['items'], [])

                # Session 4: verify Session 3 was NOT captured into long-term episode memory
                episodes = agent.runtime.agent_memory.recall('Private session secret', kinds=['episode'])
                self.assertFalse(any('Private session secret' in i['content'] for i in episodes['items']))

    def test_optional_decision_model_assist_and_gate(self):
        with tempfile.TemporaryDirectory() as ws:
            (Path(ws) / 'a.txt').write_text('ok', encoding='utf-8')
            events = []
            saw_decision = []

            def decider(dreq):
                if 'candidate' not in dreq:
                    return {'phase': 'plan', 'strategy': 'Read a.txt first', 'recommendedTools': ['read_file'], 'riskLevel': 'low', 'confidence': 0.9}
                # Gate mode: reject list_files, approve read_file
                tool = (dreq['candidate'].get('action') or {}).get('tool')
                if tool == 'list_files':
                    return {'approve': False, 'rationale': 'Read a.txt directly instead of listing', 'strategy': 'Use read_file'}
                return {'approve': True, 'rationale': 'Approved'}

            def model(req):
                if req.get('decision'):
                    saw_decision.append(req['decision'])
                if req['step'] == 1 and not req.get('repairHint'):
                    return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'List files', 'action': {'tool': 'list_files', 'args': {}}}
                if req.get('repairHint', {}).get('source') == 'decision_model':
                    return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Read a.txt as advised', 'action': {'tool': 'read_file', 'args': {'path': 'a.txt'}}}
                return {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'outcome': 'complete', 'summary': 'Read a.txt'}

            with ReactAgent(ws, decision_model=decider, decision_mode='gate') as agent:
                res = agent.run('Read a.txt', model, on_event=events.append)
                self.assertEqual(res['status'], 'complete')
                self.assertTrue(saw_decision)
                self.assertTrue(any(e['kind'] == 'decision' for e in events))
                self.assertTrue(any(e['kind'] == 'decision_gate' and not e['decision']['approve'] for e in events))


if __name__ == '__main__':
    unittest.main()
