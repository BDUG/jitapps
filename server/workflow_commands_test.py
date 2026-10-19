import json
import sys
import tempfile
import threading
import time
import unittest
import uuid
from server.workflow_commands import Commands

class CommandTests(unittest.TestCase):
    def request(self,args,**extra):
        return dict(id=str(uuid.uuid4()),command=sys.executable,args=args,stdin='',timeout=2000,**extra)
    def test_default_denial_and_validation(self):
        with self.assertRaises(PermissionError):Commands().run({})
        runner=Commands([sys.executable])
        with self.assertRaises(PermissionError):runner.run({**self.request([]),'command':'unknown'})
        with self.assertRaises(ValueError):runner.run({**self.request([]),'args':['bad\0value']})
    def test_arguments_stdin_cwd_and_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            runner=Commands([sys.executable],directory)
            value='literal; $(not-a-shell)'
            result=runner.run({**self.request(['-c','import json,sys,os; print(json.dumps([sys.argv[1],sys.stdin.read(),os.getcwd()]))',value]),'stdin':'input data'})
            self.assertEqual(result['exitCode'],0)
            self.assertEqual(json.loads(result['stdout']),[value,'input data',directory])
            result=runner.run(self.request(['-c','import sys; print("bad",file=sys.stderr);sys.exit(7)']))
            self.assertEqual(result['exitCode'],7);self.assertIn('bad',result['stderr'])
    def test_timeout_output_limit_and_cancel(self):
        runner=Commands([sys.executable])
        result=runner.run({**self.request(['-c','import time;time.sleep(10)']),'timeout':100})
        self.assertTrue(result['timedOut'])
        result=runner.run(self.request(['-c','print("x"*1000000)']))
        self.assertTrue(result['truncated']);self.assertLessEqual(len(result['stdout'].encode()),64000)
        request=self.request(['-c','import time;time.sleep(10)'])
        timer=threading.Timer(.1,lambda:runner.cancel(request['id']));timer.start()
        result=runner.run(request);timer.join();self.assertTrue(result['cancelled'])
        request=self.request(['-c','print("must not run")']);runner.cancel(request['id'])
        self.assertTrue(runner.run(request)['cancelled'])
        with self.assertRaises(ValueError):runner.run(request)

if __name__=='__main__':unittest.main()
