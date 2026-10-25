import json
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
import zipfile
from server import agent_checks as checks
from server.agent_runtime import Runtime

class ActionChecksTests(unittest.TestCase):
    def test_json_pointer_equality_contains_and_presence(self):
        result={'a/b':{'~key':[False,{'ok':None}]},'message':'quartz verified','values':[1,{'x':[2]}]}
        assertions=[{'path':'/a~1b/~0key/1/ok','op':'exists','value':True},{'path':'/absent','op':'exists','value':False},{'path':'/a~1b/~0key/1/ok','op':'equals','value':None},{'path':'/message','op':'contains','value':'verified'},{'path':'/values','op':'contains','value':{'x':[2]}},{'path':'','op':'equals','value':result}]
        self.assertTrue(checks.evaluate(result,assertions)['passed'])
        for path,value in [('/missing',None),('/a~1b/~0key/0',0),('/a~1b/~0key/-1',None),('/a~1b/~0key/01',None)]:self.assertFalse(checks.evaluate(result,[{'path':path,'op':'equals','value':value}])['passed'])
        self.assertFalse(checks.equal({'x':True},{'x':1}));self.assertTrue(checks.equal(1,1.0))
    def test_invalid_checks_are_rejected_before_execution(self):
        for value in ('eval()',{},[{'op':'exec','path':'','value':'code'}],[{'op':'equals','path':'plain','value':1}],[{'op':'exists','path':'','value':1}],[{'op':'equals','path':'/~2','value':0}],[{'op':'equals','path':''}],[{'op':'equals','path':'','value':float('inf')}]):
            with self.assertRaises(ValueError):checks.validate(value)
        with tempfile.TemporaryDirectory() as folder:
            runtime=Runtime(folder,[]);session=runtime.start({'goal':'check validation','allowEdits':True})
            try:
                with self.assertRaises(ValueError):runtime.dispatch({'op':'tool','session':session['id'],'tool':'write_file','callId':'invalid','args':{'path':'should-not-exist','content':'no','expectedHash':'missing'},'checks':[{'path':'x','op':'equals','value':1}]})
                self.assertFalse((Path(folder)/'should-not-exist').exists());self.assertFalse(runtime.get(session['id'])['_calls'])
            finally:runtime.close()
    def test_skill_evidence_does_not_ignore_failed_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Runtime(folder,[sys.executable]);s=runtime.start({'goal':'learn checked result','allowEdits':True,'allowCommands':True});sid=s['id']
            try:
                runtime.dispatch({'op':'tool','session':sid,'tool':'run_command','callId':'checked-command','args':{'command':sys.executable,'args':['-c','print("actual")']},'checks':[{'path':'/stdout','op':'contains','value':'missing'}]})
                saved=runtime.dispatch({'op':'tool','session':sid,'tool':'skill_save','callId':'save-skill','args':{'id':'check-command','name':'Checked command','description':'Validate command output','content':'Inspect stdout and rerun checks.','reason':'Retain unresolved limitation','expectedRevision':0,'evidenceCallIds':['checked-command']}})
                self.assertTrue(saved['ok']);self.assertEqual(saved['result']['evidenceStatus'],'unverified');self.assertFalse(saved['result']['evidence'][0]['checksPassed'])
            finally:runtime.close()
    def test_failed_checks_persist_recover_block_complete_and_export(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Runtime(folder,[sys.executable]);s=runtime.start({'goal':'observe real command checks','allowCommands':True});sid=s['id']
            def run(value):
                return runtime.dispatch({'op':'tool','session':sid,'tool':'run_command','callId':uuid.uuid4().hex,'args':{'command':sys.executable,'args':['-c','print("actual")']},'checks':[{'path':'/stdout','op':'contains','value':value}]})
            try:
                failed=run('expected');self.assertTrue(failed['ok']);self.assertFalse(failed['checks']['passed']);self.assertEqual(failed['result']['exitCode'],0)
                call=runtime.get(sid)['events'][-1]['value']['id'];saved=runtime.dispatch({'op':'tool_status','session':sid,'callId':call});self.assertEqual(saved['observation']['checks'],failed['checks'])
                with self.assertRaisesRegex(ValueError,'checks remain failed'):runtime.dispatch({'op':'finish','session':sid})
                runtime.close();runtime=Runtime(folder,[sys.executable]);runtime.dispatch({'op':'resume','session':sid})
                with self.assertRaisesRegex(ValueError,'checks remain failed'):runtime.dispatch({'op':'finish','session':sid})
                passed=run('actual');self.assertTrue(passed['checks']['passed']);runtime.dispatch({'op':'finish','session':sid,'summary':'Observed corrected expectation'})
                with zipfile.ZipFile(runtime.package(runtime.get(sid))) as archive:
                    report=json.loads(archive.read('action-checks.json'));self.assertEqual(report['failed'],1);self.assertEqual(report['passed'],1);self.assertTrue(report['latestPassed']);saved=json.loads(archive.read('session.json'));self.assertTrue(saved['events'][-1]['value']['evidence']['checksPassed']);self.assertTrue(any(e['value'].get('checks',{}).get('passed') is False for e in saved['events'] if e['kind']=='observation'))
            finally:runtime.close()

if __name__=='__main__':unittest.main()
