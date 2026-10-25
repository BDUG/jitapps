import importlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from codingagentlib import Agent,Runtime

class LibraryTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def test_server_aliases_share_implementation(self):
        from server.agent_runtime import Runtime as Legacy
        self.assertIs(Runtime,Legacy)
        self.assertEqual(Runtime.__module__,'codingagentlib.python.agent_runtime')
    def test_standalone_native_python_loop_edits_and_verifies(self):
        def model(request):
            count=sum(e['kind']=='observation' for e in request['events'])
            action={'tool':'write_file','args':{'path':'hello.txt','content':'hello','expectedHash':'missing'}} if count==0 else {'tool':'run_command','args':{'command':sys.executable,'args':['-c',"from pathlib import Path; assert Path('hello.txt').read_text()=='hello'"]}} if count==1 else None
            return {'sessionId':request['sessionId'],'step':request['step'],'status':'act' if action else 'done','plan':'Write then verify observed content','action':action,'summary':'Verified greeting','verification':['Observed command exit 0']}
        with Agent(self.root,[sys.executable]) as agent:
            result=agent.run('Create greeting',model,allow_edits=True,allow_commands=True)
            self.assertEqual(result['status'],'complete');self.assertEqual((self.root/'hello.txt').read_text(),'hello')
            changes=agent.dispatch({'op':'changes','session':result['sessionId']});self.assertEqual(changes['changes'][0]['path'],'hello.txt')
            package=agent.runtime.package(agent.runtime.get(result['sessionId']));self.assertTrue(package.is_file())
    def test_invalid_plans_never_execute_and_cancel_is_cooperative(self):
        with Agent(self.root) as agent:
            result=agent.run('Do not write',lambda r:{'sessionId':'wrong','step':r['step'],'status':'act','plan':'bad','action':{'tool':'write_file','args':{'path':'bad','content':'x','expectedHash':'missing'}}})
            self.assertEqual(result['status'],'waiting');self.assertEqual(result['invalidPlans'],3);self.assertFalse((self.root/'bad').exists())
            cancel=threading.Event();cancel.set();result=agent.run('Stop',lambda r:self.fail('model should not run'),cancel_event=cancel);self.assertEqual(result['reason'],'cancelled')
    def test_native_driver_cannot_claim_unverified_completion(self):
        with Agent(self.root,[sys.executable]) as agent:
            def model(r):
                changed=any(e['kind']=='observation' for e in r['events'])
                return {'sessionId':r['sessionId'],'step':r['step'],'status':'done' if changed else 'act','plan':'Write requested content','action':None if changed else {'tool':'write_file','args':{'path':'pending.txt','content':'pending','expectedHash':'missing'}},'summary':'Claims completion without verification'}
            result=agent.run('Write and verify',model,allow_edits=True,allow_commands=True)
            self.assertEqual(result['status'],'waiting');self.assertIn('verification',result['error']);self.assertTrue((self.root/'pending.txt').exists())
    def test_budget_resume_and_request_identity(self):
        with Agent(self.root) as agent:
            def model(r):return {'sessionId':r['sessionId'],'step':r['step'],'status':'act','plan':'Inspect','action':{'tool':'list_files','args':{}}}
            result=agent.run('Inspect',model,max_steps=1);self.assertEqual(result['reason'],'step_budget')
            result=agent.run('Inspect',lambda r:{'sessionId':r['sessionId'],'step':r['step'],'status':'ask','plan':'Need input','action':None,'question':'Continue?'},session_id=result['sessionId']);self.assertEqual(result['status'],'waiting')
    def test_json_lines_worker_is_standalone(self):
        request={'protocol':'codingagentlib/1','id':1,'method':'dispatch','params':{'op':'health'}}
        p=subprocess.run([sys.executable,'-m','codingagentlib','--workspace',str(self.root)],input=json.dumps(request)+'\n',text=True,capture_output=True,check=True)
        response=json.loads(p.stdout);self.assertEqual(response['id'],1);self.assertTrue(response['result']['enabled']);self.assertTrue(response['ok'])
    def test_legacy_compiler_dependency_is_pinned_and_protected(self):
        from codingagentlib.python.agent_navigation import Navigation
        service=self.root/'server/code-navigation';compiler=service/'node_modules/typescript';compiler.joinpath('lib').mkdir(parents=True)
        service.joinpath('service.cjs').write_text("require('../../codingagentlib/python/code-navigation/service.cjs');")
        compiler.joinpath('package.json').write_text('{}');compiler.joinpath('lib/typescript.js').write_text('// compiler')
        canonical=self.root/'codingagentlib/python/code-navigation/service.cjs';canonical.parent.mkdir(parents=True);canonical.write_text('// trusted implementation')
        navigation=Navigation(service);navigation.verify();self.assertIn(canonical,navigation.private_paths)
        canonical.write_text('// modified implementation')
        with self.assertRaisesRegex(ValueError,'Trusted navigation files changed'):navigation.verify()
    def test_protocol_artifact_matches_javascript(self):
        root=Path(__file__).parent.parent
        result=subprocess.run(['node','-e',"process.stdout.write(JSON.stringify(require('./codingagentlib/javascript/spec.js')))"],cwd=root,text=True,capture_output=True,check=True)
        self.assertEqual(json.loads(result.stdout),json.loads((root/'codingagentlib/protocol.json').read_text()))
    def test_no_headless_dependency_on_server(self):
        for p in (Path(__file__).parent/'python').glob('*.py'):
            self.assertNotIn('from server',p.read_text());self.assertNotIn('import server',p.read_text())

if __name__=='__main__':unittest.main()
