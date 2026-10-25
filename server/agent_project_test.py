import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from server.agent_runtime import Runtime

class ProjectBridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.runtime=Runtime(self.root,[]);self.sid=self.runtime.start({'goal':'edit current project','tool':'codeiX','allowEdits':True,'allowProjectContext':True,'allowProjectEdits':True})['id']
    def tearDown(self):self.runtime.close();self.tmp.cleanup()
    def call(self,op,**data):return self.runtime.dispatch({'op':op,'session':self.sid,**data})
    def context(self,value):
        data=json.dumps(value);id=self.call('context_begin')['upload'];self.call('context_chunk',upload=id,offset=0,text=data);return self.call('context_commit',upload=id,bytes=len(data.encode()))['snapshot']
    def test_editor_action_permissions_stale_guard_recovery_and_idempotency(self):
        snapshot=self.context({'tool':'codeiX','project':{'name':'Browser','version':1,'files':[]}})
        action={'currentTool':'codeiX','tool':'apply_project','callId':'edit1','args':{'expectedSnapshot':snapshot,'changes':[]},'checks':[{'path':'/status','op':'equals','value':'applied'}]}
        self.assertEqual(self.call('project_begin',**action)['pending']['tool'],'apply_project')
        self.assertEqual(self.call('tool_status',callId='edit1')['state'],'client_pending')
        self.assertEqual(self.call('project_begin',**action)['pending']['tool'],'apply_project')
        result={'source':'browser editor','tool':'codeiX','snapshot':snapshot,'status':'applied','validated':True}
        finished=self.call('project_finish',callId='edit1',result=result);self.assertTrue(finished['ok']);self.assertTrue(finished['checks']['passed'])
        self.assertEqual(self.call('project_finish',callId='edit1',result=result),finished)
        self.assertEqual(self.call('tool_status',callId='edit1')['observation'],finished)
        with self.assertRaises(ValueError):self.call('project_begin',**{**action,'callId':'stale','args':{'expectedSnapshot':'x'}})
        with self.assertRaises(ValueError):self.call('project_begin',**{**action,'callId':'other','currentTool':'appiX'})
        other=self.runtime.start({'goal':'read only','tool':'codeiX','allowEdits':False,'allowProjectContext':True,'allowProjectEdits':True})
        with self.assertRaises(PermissionError):self.runtime.dispatch({'op':'project_begin','session':other['id'],**action})
    def test_current_project_is_exported_without_workspace_changes(self):
        document={'version':1,'name':'Current app','files':[{'path':'src/main.js','content':'actual browser source'}]}
        self.context({'tool':'codeiX','project':document});self.call('finish',summary='Current project captured')
        # Exporting refreshes a completed run's snapshot without resuming commands.
        self.context({'tool':'codeiX','project':document})
        with zipfile.ZipFile(self.runtime.package(self.runtime.get(self.sid))) as archive:
            self.assertEqual(json.loads(archive.read('project/codeiX.json')),document)
            self.assertEqual(archive.read('project/files/src/main.js'),b'actual browser source')
            self.assertEqual(json.loads(archive.read('changes.json')),[])
    def test_missing_optional_diff_original_does_not_break_zip(self):
        (self.root/'source.txt').write_text('before')
        self.call('tool',tool='write_file',callId='write',args={'path':'source.txt','content':'after','expectedHash':__import__('hashlib').sha256(b'before').hexdigest()})
        s=self.runtime.get(self.sid);backup=s['_dir']/'backups'/s['backups']['source.txt']['id'];backup.unlink()
        with zipfile.ZipFile(self.runtime.package(s)) as archive:
            self.assertEqual(archive.read('changes/source.txt'),b'after');self.assertTrue(json.loads(archive.read('manifest.json'))['warnings'])
    def test_package_rejects_private_directory_symlinks(self):
        external=self.root/'outside';external.mkdir();s=self.runtime.get(self.sid)
        (s['_dir']/'contexts').symlink_to(external,target_is_directory=True)
        with self.assertRaises(PermissionError):self.runtime.package(s)

if __name__=='__main__':unittest.main()
