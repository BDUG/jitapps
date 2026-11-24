import shutil
import tempfile
import unittest

from codingagentlib.python.agent_runtime import Runtime, TOOLS


class DefaultInterpreterToolsTests(unittest.TestCase):
    def test_nodejs_and_python3_tools_registered_and_execute(self):
        names = {t['name'] for t in TOOLS}
        self.assertIn('nodejs', names)
        self.assertIn('python3', names)

        cmds = [c for c in ('node', 'python3') if shutil.which(c)]
        if len(cmds) < 2:
            self.skipTest('Both node and python3 must be on PATH')

        with tempfile.TemporaryDirectory() as tmp:
            rt = Runtime(tmp, commands=cmds)
            try:
                s = rt.dispatch({'op': 'start', 'goal': 'Run node and python3', 'allowCommands': True})
                sid = s['id']
                n_res = rt.dispatch({'op': 'tool', 'session': sid, 'tool': 'nodejs', 'args': {'code': 'console.log("node:" + (2 + 3))'}, 'callId': 'n1'})
                self.assertTrue(n_res['ok'], n_res)
                self.assertIn('node:5', n_res['result']['stdout'])

                p_res = rt.dispatch({'op': 'tool', 'session': sid, 'tool': 'python3', 'args': {'code': 'print("py:" + str(6 * 7))'}, 'callId': 'p1'})
                self.assertTrue(p_res['ok'], p_res)
                self.assertIn('py:42', p_res['result']['stdout'])
            finally:
                rt.close()


if __name__ == '__main__':
    unittest.main()
