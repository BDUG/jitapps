import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
import uuid
from server.agent_runtime import Runtime

class AgentRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);(self.root/'calc.py').write_text('def add(a,b):\n    return a-b\n')
        self.runtime=Runtime(self.root,[sys.executable]);self.session=self.runtime.start({'goal':'Fix and verify','allowEdits':True,'allowCommands':True});self.sid=self.session['id']
    def tearDown(self):self.runtime.close();self.tmp.cleanup()
    def tool(self,name,**args):return self.runtime.dispatch({'op':'tool','session':self.sid,'tool':name,'args':args,'callId':uuid.uuid4().hex})
    def test_read_only_file_browser_after_cancel(self):
        self.runtime.cancel(self.runtime.get(self.sid))
        before=len(self.runtime.get(self.sid)['events'])
        listing=self.runtime.dispatch({'op':'files','session':self.sid,'limit':1})
        self.assertEqual(listing['files'][0]['path'],'calc.py')
        content=self.runtime.dispatch({'op':'file','session':self.sid,'path':'calc.py','limit':4})
        self.assertEqual(content['text'],'def ')
        self.assertFalse(content['done'])
        self.assertEqual(len(self.runtime.get(self.sid)['events']),before)
        with self.assertRaises((ValueError,PermissionError)):
            self.runtime.dispatch({'op':'file','session':self.sid,'path':'../outside'})

    def test_project_review_policy_survives_runtime_reload(self):
        self.assertTrue(self.session['reviewProjectEdits'])
        direct=self.runtime.start({'goal':'Apply directly','reviewProjectEdits':False})
        restored=Runtime(self.root,[sys.executable])
        try:
            self.assertTrue(restored.dispatch({'op':'session','session':self.sid})['reviewProjectEdits'])
            self.assertFalse(restored.dispatch({'op':'session','session':direct['id']})['reviewProjectEdits'])
        finally:
            restored.close()
    def test_live_instruction_revision_and_event_delta(self):
        value=self.runtime.dispatch({'op':'event','session':self.sid,'value':{'status':'follow_up','text':'New direction'}})
        stale=self.runtime.dispatch({'op':'tool','session':self.sid,'tool':'write_file','args':{'path':'stale.txt','content':'no','expectedHash':'missing'},'callId':'stale','expectedUserRevision':-1})
        self.assertTrue(stale['steeringChanged']);self.assertFalse((self.root/'stale.txt').exists())
        self.assertEqual(self.runtime.dispatch({'op':'tool_status','session':self.sid,'callId':'stale'})['state'],'not_found')
        self.assertTrue(self.runtime.dispatch({'op':'finish','session':self.sid,'expectedUserRevision':-1})['steeringChanged'])
        self.assertEqual(self.runtime.dispatch({'op':'events','session':self.sid,'after':value['index']})['events'],[])
        result=self.runtime.dispatch({'op':'tool','session':self.sid,'tool':'list_files','args':{},'callId':'current','expectedUserRevision':value['index']})
        self.assertTrue(result['ok'])
        self.assertEqual(len(self.runtime.dispatch({'op':'events','session':self.sid,'after':value['index']})['events']),2)
        self.runtime.dispatch({'op':'finish','session':self.sid,'expectedUserRevision':value['index']})
        with self.assertRaises(ValueError):self.runtime.dispatch({'op':'event','session':self.sid,'value':{'status':'follow_up','text':'Too late'}})
    def test_recorded_call_reconciliation_and_unknown_outcome(self):
        request={'op':'tool','session':self.sid,'tool':'write_file','args':{'path':'once.txt','content':'once','expectedHash':'missing'},'callId':'once'}
        result=self.runtime.dispatch(request)
        for _ in range(2):self.assertEqual(self.runtime.dispatch({'op':'tool_status','session':self.sid,'callId':'once'}),{'state':'complete','observation':result})
        with self.assertRaises(ValueError):self.runtime.dispatch(request)
        s=self.runtime.get(self.sid);s['_calls'].add('lost');self.runtime.event(s,'action',{'id':'lost','tool':'write_file','args':{}})
        self.assertEqual(self.runtime.dispatch({'op':'tool_status','session':self.sid,'callId':'lost'})['state'],'unknown')
        self.assertEqual((self.root/'once.txt').read_text(),'once')
    def test_audit_failure_releases_running_slot(self):
        original=self.runtime.event
        def event(s,kind,value):
            if kind=='action':raise OSError('Audit write failed')
            return original(s,kind,value)
        self.runtime.event=event
        self.assertFalse(self.tool('list_files')['ok'])
        self.assertFalse(self.runtime.get(self.sid)['_running'])
        self.runtime.event=original
        self.assertTrue(self.tool('list_files')['ok'])
    def test_completion_requires_success_after_latest_edit(self):
        source=self.tool('read_file',path='calc.py')['result']
        self.tool('replace_text',path='calc.py',find='a-b',replacement='a+b',expectedHash=source['hash'])
        with self.assertRaisesRegex(ValueError,'Completion review'):self.runtime.dispatch({'op':'finish','session':self.sid,'summary':'Done'})
        self.tool('run_command',command=sys.executable,args=['-c','raise SystemExit(1)'])
        with self.assertRaisesRegex(ValueError,'Completion review'):self.runtime.dispatch({'op':'finish','session':self.sid,'summary':'Done'})
        self.tool('run_command',command=sys.executable,args=['-c','from calc import add; assert add(2,3)==5'])
        result=self.runtime.dispatch({'op':'finish','session':self.sid,'summary':'Verified'})
        self.assertEqual(result['status'],'complete');self.assertFalse(result['events'][-1]['value']['evidence']['needsVerification'])
    def test_completion_review_allows_partial_and_readonly_work(self):
        self.tool('write_script',path='verify.py',content='print("not yet run")')
        result=self.runtime.dispatch({'op':'finish','session':self.sid,'outcome':'partial','summary':'Verification unavailable'})
        self.assertTrue(result['events'][-1]['value']['evidence']['needsVerification'])
        other=self.runtime.start({'goal':'Inspect only','allowEdits':False,'allowCommands':False})
        self.assertEqual(self.runtime.dispatch({'op':'finish','session':other['id'],'summary':'Inspection complete'})['status'],'complete')
    def test_durable_turns_feedback_and_restart(self):
        turn=self.runtime.dispatch({'op':'turn','session':self.sid,'expectedUserRevision':-1});self.assertEqual(turn['step'],1)
        feedback={'op':'feedback','session':self.sid,'step':1,'error':'Expected JSON object','response':'{broken'}
        event=self.runtime.dispatch(feedback);self.assertEqual(event['value']['response'],'{broken');self.assertEqual(self.runtime.dispatch(feedback),event)
        with self.assertRaises(ValueError):self.runtime.dispatch({**feedback,'error':'Changed error'})
        with self.assertRaises(ValueError):self.runtime.dispatch({**feedback,'step':55})
        self.assertEqual(self.runtime.dispatch({'op':'turn','session':self.sid})['step'],2)
        self.runtime.close();self.runtime=Runtime(self.root,[sys.executable]);self.runtime.dispatch({'op':'resume','session':self.sid})
        self.assertEqual(self.runtime.dispatch({'op':'turn','session':self.sid})['step'],3)
        restored=self.runtime.dispatch({'op':'session','session':self.sid})
        self.assertEqual(len([e for e in restored['events'] if e['kind']=='protocol_error']),1)
        self.assertTrue(self.runtime.dispatch({'op':'event','session':self.sid,'value':{'status':'follow_up','text':'New goal'}}))
        self.assertTrue(self.runtime.dispatch({'op':'turn','session':self.sid,'expectedUserRevision':-1})['steeringChanged'])
    def test_turn_allocation_is_unique_and_rejects_paused_runs(self):
        values=[]
        def allocate():values.append(self.runtime.dispatch({'op':'turn','session':self.sid})['step'])
        threads=[threading.Thread(target=allocate) for _ in range(5)]
        for thread in threads:thread.start()
        for thread in threads:thread.join()
        self.assertEqual(sorted(values),[1,2,3,4,5])
        self.runtime.dispatch({'op':'cancel','session':self.sid})
        with self.assertRaises(PermissionError):self.runtime.dispatch({'op':'turn','session':self.sid})
    def test_completion_uses_runtime_evidence(self):
        self.tool('run_command',command=sys.executable,args=['-c','raise SystemExit(2)'])
        self.tool('run_command',command=sys.executable,args=['-c','print(123)'])
        with self.assertRaises(ValueError):self.runtime.dispatch({'op':'finish','session':self.sid,'outcome':'invented'})
        result=self.runtime.dispatch({'op':'finish','session':self.sid,'outcome':'partial','summary':'Some work remains','verification':['model claim']})
        record=result['events'][-1]['value']
        self.assertEqual(record['outcome'],'partial')
        self.assertEqual(record['evidence']['commands'],2)
        self.assertEqual(record['evidence']['passed'],1)
        self.assertEqual(record['evidence']['failed'],1)
        self.assertEqual(record['evidence']['latest']['exitCode'],0)
    def test_disabled_paths_and_caps(self):
        with self.assertRaises(PermissionError):Runtime().start({'goal':'no'})
        outside=self.root.parent/'outside';(self.root/'link').symlink_to(self.root.parent,target_is_directory=True)
        for path in ['../outside','/etc/passwd','link/file','.git/config','.env']:
            self.assertFalse(self.tool('read_file',path=path)['ok'],path)
        s=self.runtime.start({'goal':'Read only'})
        denied=self.runtime.dispatch({'op':'tool','session':s['id'],'tool':'write_file','args':{'path':'no','content':'x','expectedHash':'missing'},'callId':'deny'})
        self.assertFalse(denied['ok']);self.assertFalse((self.root/'no').exists())
    def test_hash_edit_recovery_and_reload(self):
        value=self.tool('read_file',path='calc.py')['result'];original=value['text']
        self.assertFalse(self.tool('write_file',path='calc.py',content='bad',expectedHash='wrong')['ok'])
        self.assertTrue(self.tool('replace_text',path='calc.py',find='a-b',replacement='a+b',expectedHash=value['hash'])['ok'])
        changes=self.tool('changes')['result']['changes'];self.assertEqual(changes[0]['status'],'modified');self.assertTrue(changes[0]['recoverable'])
        current=self.tool('read_file',path='calc.py')['result'];self.assertTrue(self.tool('restore_file',path='calc.py',expectedHash=current['hash'])['ok']);self.assertEqual((self.root/'calc.py').read_text(),original)
        self.tool('write_file',path='new.txt',content='new',expectedHash='missing');self.tool('delete_file',path='new.txt',expectedHash=self.tool('read_file',path='new.txt')['result']['hash'])
        restored=Runtime(self.root,[sys.executable]);self.assertEqual(restored.get(self.sid)['status'],'paused');self.assertTrue(restored.get(self.sid)['events']);restored.close()
    def test_managed_scripts_real_verification_and_large_logs(self):
        self.assertTrue(self.tool('write_script',path='check.py',content='scope={}\nexec(open("calc.py").read(),scope)\nassert scope["add"](2,3)==5\nprint("verified")')['ok'])
        failed=self.tool('run_script',path='check.py',command=sys.executable)['result'];self.assertNotEqual(failed['exitCode'],0)
        source=self.tool('read_file',path='calc.py')['result'];self.tool('replace_text',path='calc.py',find='a-b',replacement='a+b',expectedHash=source['hash'])
        passed=self.tool('run_script',path='check.py',command=sys.executable)['result'];self.assertEqual(passed['exitCode'],0);self.assertIn('verified',passed['stdout'])
        output=self.tool('run_command',command=sys.executable,args=['-c','print("😀"*20000)'])['result'];self.assertTrue(output['outputPaged']);self.assertEqual(output['exitCode'],0)
        text='';offset=0
        while True:
            page=self.tool('read_command_output',jobId=output['jobId'],offset=offset,limit=4093)['result'];text+=page['text'];offset=page['nextOffset']
            if page['done']:break
        self.assertEqual(text,'😀'*20000+'\n')
        self.runtime.dispatch({'op':'finish','session':self.sid,'summary':'done'})
        self.assertIn('check.py',self.runtime.dispatch({'op':'artifacts','session':self.sid})['scripts'])
    def test_command_cancel_timeout_and_replay(self):
        value=self.tool('run_command',command=sys.executable,args=['-c','import time;time.sleep(10)'],timeout=100)['result'];self.assertTrue(value['timedOut'])
        self.assertFalse(self.tool('run_command',command='unapproved',args=[])['ok'])
        timer=threading.Timer(.1,lambda:self.runtime.dispatch({'op':'cancel','session':self.sid}));timer.start();value=self.tool('run_command',command=sys.executable,args=['-c','import time;time.sleep(10)'])['result'];timer.join();self.assertTrue(value['cancelled'])
        with self.assertRaises(PermissionError):self.tool('list_files')
        self.runtime.dispatch({'op':'resume','session':self.sid});request={'op':'tool','session':self.sid,'tool':'list_files','args':{},'callId':'one-use'};self.runtime.dispatch(request)
        with self.assertRaises(ValueError):self.runtime.dispatch(request)

if __name__=='__main__':unittest.main()
