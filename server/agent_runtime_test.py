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
