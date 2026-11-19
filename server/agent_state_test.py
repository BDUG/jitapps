import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import venv
from codingagentlib import Runtime
from server.agent_state import location

class DurableAgentTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.workspace=self.root/'workspace';self.workspace.mkdir()
    def runtime(self,**options):
        runtime=Runtime(self.workspace,[sys.executable],**options);self.addCleanup(runtime.close);return runtime
    def tool(self,runtime,session,name,args,ident):
        result=runtime.dispatch({'op':'tool','session':session,'tool':name,'args':args,'callId':ident})
        self.assertTrue(result['ok'],result);return result['result']
    def test_legacy_migration_retains_scripts_context_logs_and_backups_after_restart(self):
        (self.workspace/'source.txt').write_text('original')
        runtime=self.runtime();session=runtime.start({'goal':'Persist artifacts','allowEdits':True,'allowCommands':True})['id']
        self.tool(runtime,session,'write_script',{'path':'nested/check.py','content':'print("durable")'},'write')
        self.tool(runtime,session,'write_file',{'path':'source.txt','content':'changed','expectedHash':runtime.manifest()['source.txt']['hash']},'edit')
        job=self.tool(runtime,session,'run_script',{'command':sys.executable,'path':'nested/check.py','cwd':str(self.workspace)},'run')
        begin=runtime.dispatch({'op':'context_begin','session':session})
        text=json.dumps({'tool':'rstiX','project':{'files':[{'path':'docs/a.rst','content':'evidence'}]}})
        runtime.dispatch({'op':'context_chunk','session':session,'upload':begin['upload'],'offset':0,'text':text})
        snapshot=runtime.dispatch({'op':'context_commit','session':session,'upload':begin['upload'],'bytes':len(text.encode())})
        runtime.close()
        state=location(self.workspace,self.root/'private/providers.json')
        self.assertTrue((self.workspace/'.suite-agent').exists())
        migrated=self.runtime(state_dir=state)
        self.assertEqual(migrated.dispatch({'op':'list'})['sessions'][0]['id'],session)
        migrated.dispatch({'op':'resume','session':session})
        self.assertEqual(self.tool(migrated,session,'read_script',{'path':'nested/check.py'},'read')['text'],'print("durable")')
        self.assertEqual(self.tool(migrated,session,'run_script',{'command':sys.executable,'path':'nested/check.py'},'rerun')['stdout'].strip(),'durable')
        self.assertIn('durable',self.tool(migrated,session,'read_command_output',{'jobId':job['jobId']},'output')['text'])
        self.assertIn('evidence',self.tool(migrated,session,'read_context',{'snapshot':snapshot['snapshot']},'context')['text'])
        self.tool(migrated,session,'restore_file',{'path':'source.txt','expectedHash':migrated.manifest()['source.txt']['hash']},'restore')
        self.assertEqual((self.workspace/'source.txt').read_text(),'original')
    def test_state_is_private_even_with_custom_name_inside_workspace(self):
        runtime=self.runtime(state_dir=self.workspace/'private-state')
        session=runtime.start({'goal':'Keep private'})
        self.assertFalse(any('private-state' in path for path in runtime.manifest()))
        with self.assertRaises(PermissionError):runtime.path('private-state/sessions/'+session['id']+'/session.json')
    def test_launcher_symlink_preserves_virtual_environment_and_cwd_is_bounded(self):
        env=self.root/'venv';venv.EnvBuilder(with_pip=False,symlinks=True).create(env)
        python=env/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
        runtime=Runtime(self.workspace,[str(python)]);self.addCleanup(runtime.close)
        session=runtime.start({'goal':'Check launch','allowCommands':True})['id']
        result=self.tool(runtime,session,'run_command',{'command':str(python),'cwd':str(self.workspace),'args':['-c','import sys;print(sys.prefix)']},'venv')
        self.assertEqual(Path(result['stdout'].strip()),env)
        self.assertEqual(result['launchedExecutable'],str(python))
        for cwd in [str(self.root),'../outside']:
            result=runtime.dispatch({'op':'tool','session':session,'tool':'run_command','callId':'bad-'+str(len(cwd)),'args':{'command':str(python),'cwd':cwd}})
            self.assertFalse(result['ok'])

    def test_one_state_directory_cannot_silently_hide_another_workspaces_sessions(self):
        state=self.root/'private-agent'
        first=self.runtime(state_dir=state)
        first.start({'goal':'Keep original workspace'})
        other=self.root/'other';other.mkdir()
        with self.assertRaisesRegex(ValueError,'different workspace'):
            Runtime(other,[],state_dir=state)
        self.assertEqual(len(first.dispatch({'op':'list'})['sessions']),1)
