import copy
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
import uuid
import zipfile
from server.agent_runtime import Runtime
from server import agent_workflows as workflows

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.runtime=Runtime(self.root,[sys.executable]);self.s=self.runtime.start({'goal':'Reusable text transform','allowEdits':True,'allowCommands':True});self.sid=self.s['id'];(self.root/'source.txt').write_text('hello')
        self.definition={'format':'suite-tool-workflow/v1','name':'Uppercase text','description':'Transform a text file with a local program','inputs':{'file':{'type':'string','required':True}},'steps':[{'id':'read','tool':'read_file','args':{'path':{'$input':'file'}}},{'id':'program','tool':'run_command','args':{'command':sys.executable,'args':['-c','import sys; print(sys.argv[1].upper(), end="")',{'$step':'read','path':'/text'}]}},{'id':'write','tool':'write_file','args':{'path':{'$input':'file'},'content':{'$step':'program','path':'/stdout'},'expectedHash':{'$step':'read','path':'/hash'}}}]}
    def tearDown(self):self.runtime.close();self.tmp.cleanup()
    def tool(self,name,**args):return self.runtime.dispatch({'op':'tool','session':self.sid,'tool':name,'args':args,'callId':uuid.uuid4().hex})
    def save(self,**args):
        result=self.tool('workflow_save',id='uppercase',expectedRevision=0,definition=self.definition,**args);self.assertTrue(result['ok'],result);return result['result']
    def read(self,revision=1):return self.tool('workflow_read',id='uppercase',revision=revision)
    def test_program_chaining_batches_audit_and_cross_session_reuse(self):
        self.save();self.assertFalse(self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'})['ok']);self.read()
        first=self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'},maxSteps=1);self.assertTrue(first['ok'],first);run=first['result'];self.assertEqual(run['status'],'paused')
        result=self.tool('workflow_continue',runId=run['runId']);self.assertTrue(result['ok'],result);self.assertEqual(result['result']['status'],'complete');self.assertEqual((self.root/'source.txt').read_text(),'HELLO')
        steps=result['result']['steps'];self.assertEqual(len({s['callId'] for s in steps}),3)
        events=self.runtime.get(self.sid)['events'];self.assertTrue(all(any(e['kind']=='observation' and e['value']['id']==s['callId'] for e in events) for s in steps))
        self.assertFalse(self.tool('workflow_continue',runId=run['runId'])['ok'])
        self.sid=self.runtime.start({'goal':'Reuse uppercase','allowEdits':True,'allowCommands':True})['id'];self.assertEqual(self.tool('workflow_list',query='uppercase')['result']['total'],1);self.read();self.assertTrue(self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'})['ok'])
    def test_provenance_and_packaging_exact_revisions(self):
        self.save();self.read();run=self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'})['result']
        saved=self.tool('workflow_save',id='uppercase',expectedRevision=1,definition=self.definition,evidenceCallIds=[step['callId'] for step in run['steps']]);self.assertEqual(saved['result']['evidenceStatus'],'observed-sequence')
        self.runtime.dispatch({'op':'cancel','session':self.sid})
        archive=self.runtime.package(self.runtime.get(self.sid))
        with zipfile.ZipFile(archive) as z:
            records=json.loads(z.read('workflows.json'));self.assertEqual([r['revision'] for r in records],[1,2]);self.assertEqual(json.loads(z.read('workflow-executions.json'))[run['runId']]['status'],'complete')
    def test_permissions_failure_stops_and_abandon(self):
        self.save();self.sid=self.runtime.start({'goal':'read only','allowEdits':False,'allowCommands':False})['id'];self.read()
        self.assertFalse(self.tool('workflow_save',id='denied',expectedRevision=0,definition=self.definition)['ok'])
        result=self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'});self.assertFalse(result['ok']);self.assertEqual(result['result']['status'],'failed');self.assertEqual((self.root/'source.txt').read_text(),'hello');self.assertEqual(len(result['result']['steps']),2)
        self.assertTrue(self.tool('workflow_abandon',runId=result['result']['runId'],reason='Command permission unavailable')['ok'])
    def test_pinning_disable_and_revision_conflicts(self):
        self.save();self.read();run=self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'},maxSteps=1)['result'];new=copy.deepcopy(self.definition);new['steps'][1]['args']['args']=['-c','raise Exception("new version")']
        self.assertTrue(self.tool('workflow_save',id='uppercase',expectedRevision=1,definition=new)['ok']);self.assertFalse(self.tool('workflow_save',id='uppercase',expectedRevision=1,definition=new)['ok']);self.assertTrue(self.tool('workflow_continue',runId=run['runId'])['ok'])
        self.assertTrue(self.tool('workflow_save',id='uppercase',expectedRevision=2,definition=new,enabled=False)['ok']);self.assertFalse(self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'})['ok']);self.assertEqual(self.tool('workflow_list')['result']['total'],0)
    def test_invalid_definitions_inputs_and_reference_injection(self):
        for change in [('tool','workflow_run'),('tool',[]),('args',{'path':{'$step':'read'}}),('args',{'path':{'$input':[]}})]:
            d=copy.deepcopy(self.definition);d['steps'][0][change[0]]=change[1]
            with self.assertRaises(ValueError):workflows.validate(d)
        self.save();self.read();self.assertFalse(self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':3})['ok'])
        self.assertEqual(workflows.resolve({'$input':'x'},{'x':{'$step':'not-executable'}},{}),{'$step':'not-executable'})
    def test_nonzero_and_checks_stop_before_writes(self):
        self.definition['steps'][1]['args']['args']=['-c','raise SystemExit(7)'];self.save();self.read();r=self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'});self.assertFalse(r['ok']);self.assertEqual(len(r['result']['steps']),2);self.assertEqual((self.root/'source.txt').read_text(),'hello')
    def test_interrupted_run_never_resumes_or_replays(self):
        self.save();self.read();r=self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'},maxSteps=1)['result'];s=self.runtime.get(self.sid);s['workflowRuns'][r['runId']]['status']='running';self.runtime.persist(s);self.runtime.close();self.runtime=Runtime(self.root,[sys.executable]);s=self.runtime.get(self.sid);self.assertEqual(s['workflowRuns'][r['runId']]['status'],'interrupted');self.runtime.dispatch({'op':'resume','session':self.sid});self.assertFalse(self.tool('workflow_continue',runId=r['runId'])['ok']);self.assertEqual((self.root/'source.txt').read_text(),'hello')
    def test_revision_history_comparison_and_restore_as_new_revision(self):
        self.save();changed=copy.deepcopy(self.definition);changed['description']='Improved transform'
        self.assertTrue(self.tool('workflow_save',id='uppercase',expectedRevision=1,definition=changed,enabled=False)['ok'])
        history=self.tool('workflow_history',id='uppercase',limit=1)['result'];self.assertEqual(history['total'],2);self.assertFalse(history['done']);self.assertEqual(history['revisions'][0]['revision'],2);self.assertNotIn('definition',history['revisions'][0])
        self.assertEqual(self.tool('workflow_history',id='uppercase',cursor=1)['result']['revisions'][0]['revision'],1)
        diff=self.tool('workflow_compare',id='uppercase',fromRevision=1,toRevision=2)['result'];self.assertEqual({c['path'] for c in diff['changes']},{'/enabled','/definition/description'})
        original=self.read()['result'];self.assertTrue(self.tool('workflow_save',id='uppercase',expectedRevision=2,definition=original['definition'],enabled=original['enabled'])['ok']);self.assertEqual(self.tool('workflow_compare',id='uppercase',fromRevision=1,toRevision=3)['result']['changes'],[])
        self.assertFalse(self.tool('workflow_compare',id='uppercase',fromRevision=1)['ok'])
    def test_preflight_has_no_side_effects_and_reports_permissions(self):
        self.definition['inputs']['file']['default']='source.txt';report=self.tool('workflow_preflight',definition=self.definition)['result'];self.assertTrue(report['permissionsReady']);self.assertEqual(report['inputs']['file'],'source.txt');self.assertTrue(report['steps'][1]['usesEarlierResults']);self.assertEqual((self.root/'source.txt').read_text(),'hello');self.assertEqual(self.runtime.get(self.sid)['jobs'],{})
        self.sid=self.runtime.start({'goal':'inspect only','allowEdits':False,'allowCommands':False})['id'];r=self.tool('workflow_preflight',definition=self.definition)['result'];self.assertFalse(r['permissionsReady']);self.assertTrue(r['steps'][1]['issues']);self.assertTrue(r['steps'][2]['issues']);self.assertEqual((self.root/'source.txt').read_text(),'hello')
        self.assertFalse(self.tool('workflow_preflight',definition=self.definition,inputs={'file':False})['ok'])
    def test_preflight_checks_managed_script_allowlist(self):
        self.definition['steps']=[{'id':'script','tool':'run_script','args':{'path':'verify.py','command':sys.executable}}];self.assertTrue(self.tool('workflow_preflight',definition=self.definition,inputs={'file':'source.txt'})['result']['permissionsReady'])
        self.definition['steps'][0]['args']['command']='not-allowed';self.assertFalse(self.tool('workflow_preflight',definition=self.definition,inputs={'file':'source.txt'})['result']['permissionsReady'])
    def test_stop_kills_active_program_and_skips_later_steps(self):
        self.definition['steps'][1]['args']['args']=['-c','import time; time.sleep(30)'];self.save();self.read();result=[]
        worker=threading.Thread(target=lambda:result.append(self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'})));worker.start()
        deadline=time.monotonic()+5
        while self.runtime.get(self.sid).get('_active') is None and time.monotonic()<deadline:time.sleep(.01)
        self.assertIsNotNone(self.runtime.get(self.sid).get('_active'));self.runtime.dispatch({'op':'cancel','session':self.sid});worker.join(5);self.assertFalse(worker.is_alive());self.assertFalse(result[0]['ok']);self.assertEqual(result[0]['result']['status'],'cancelled');self.assertEqual((self.root/'source.txt').read_text(),'hello')
    def test_new_instructions_pause_before_next_step(self):
        self.save();self.read();original=self.runtime.perform
        def perform(s,name,args,call,checks):
            result=original(s,name,args,call,checks)
            if name=='read_file':self.runtime.event(s,'user',{'status':'follow_up','text':'Pause for review'})
            return result
        self.runtime.perform=perform;r=self.tool('workflow_run',id='uppercase',revision=1,inputs={'file':'source.txt'})['result'];self.assertEqual(r['status'],'paused');self.assertEqual(r['nextStep'],1);self.assertEqual((self.root/'source.txt').read_text(),'hello')

if __name__=='__main__':unittest.main()
