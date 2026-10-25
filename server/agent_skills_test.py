import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import uuid
import zipfile
from server.agent_runtime import Runtime

class SkillTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.runtime=Runtime(self.root,[sys.executable]);self.session=self.runtime.start({'goal':'repair quartz validation','allowEdits':True,'allowCommands':True});self.sid=self.session['id']
    def tearDown(self):self.runtime.close();self.tmp.cleanup()
    def tool(self,tool_name,**args):
        return self.runtime.dispatch({'op':'tool','session':self.sid,'tool':tool_name,'args':args,'callId':uuid.uuid4().hex})
    def save(self,**extra):
        return self.tool('skill_save',**{'id':'quartz-validation','name':'Quartz validation','description':'Use when quartz validation fails','content':'## Prerequisites\nPython\n## Procedure\nRead source and repair the parser.\n## Verification\nRun parser tests.\n## Pitfalls\nKeep original fixtures.','reason':'Learned from local parser repair','expectedRevision':0,**extra})
    def test_reuse_restart_revision_conflict_history_disable_and_pages(self):
        saved=self.save();self.assertTrue(saved['ok']);self.assertEqual(saved['result']['revision'],1);self.assertEqual(saved['result']['evidenceStatus'],'unverified')
        self.runtime.close();self.runtime=Runtime(self.root,[sys.executable])
        other=self.runtime.start({'goal':'repair quartz parser','allowEdits':True});sid=other['id'];self.sid=sid
        found=self.runtime.dispatch({'op':'skill_search','session':sid,'query':'quartz validation'})
        self.assertEqual(found['skills'][0]['id'],'quartz-validation')
        first=self.tool('skill_read',id='quartz-validation',limit=20)['result'];self.assertFalse(first['done']);self.assertEqual(first['nextOffset'],20)
        second=self.tool('skill_read',id='quartz-validation',revision=first['revision'],offset=20,limit=64000)['result'];self.assertTrue(second['done']);self.assertEqual(first['content']+second['content'],saved['result']['content'])
        self.assertTrue(self.save(expectedRevision=1,enabled=False,reason='Disable outdated procedure')['ok'])
        self.assertFalse(self.save(expectedRevision=1)['ok'])
        self.assertEqual(self.tool('skill_search',query='quartz validation')['result']['total'],0)
        self.assertEqual(self.tool('skill_list',includeDisabled=True)['result']['total'],1)
        history=self.tool('skill_history',id='quartz-validation',limit=1)['result'];self.assertEqual(history['revisions'][0]['revision'],2);self.assertFalse(history['done'])
        self.assertEqual(self.tool('skill_read',id='quartz-validation',revision=1)['result']['content'],saved['result']['content'])
        self.assertFalse(self.save(expectedRevision=2)['result']['enabled'])
        self.assertEqual(self.tool('skill_search',query='quartz')['result']['total'],0)
    def test_actual_evidence_permissions_and_package(self):
        call=uuid.uuid4().hex
        result=self.runtime.dispatch({'op':'tool','session':self.sid,'tool':'run_command','callId':call,'args':{'command':sys.executable,'args':['-c','print("quartz parser test passed")']}})
        self.assertEqual(result['result']['exitCode'],0)
        saved=self.save(evidenceCallIds=[call]);self.assertTrue(saved['ok']);self.assertEqual(saved['result']['evidenceStatus'],'observed-command-success')
        self.assertEqual(saved['result']['evidence'][0]['jobId'],result['result']['jobId'])
        self.assertFalse(self.save(id='fake-evidence',evidenceCallIds=['invented'])['ok'])
        readonly=self.runtime.start({'goal':'inspect only','allowEdits':False})
        with self.assertRaises(PermissionError):self.runtime.dispatch({'op':'skill_save','session':readonly['id'],**{k:v for k,v in saved['result'].items() if k in ('id','name','description','content','reason')},'expectedRevision':1})
        other=self.runtime.start({'goal':'unrelated private procedure','allowEdits':True})
        self.runtime.dispatch({'op':'skill_save','session':other['id'],'id':'private-skill','name':'Private','description':'unrelated','content':'Private unrelated procedure','reason':'separate work','expectedRevision':0})
        path=self.runtime.package(self.runtime.get(self.sid))
        with zipfile.ZipFile(path) as archive:
            skills=json.loads(archive.read('skills.json'));self.assertEqual(len(skills),1);self.assertEqual(skills[0]['sourceSession'],self.sid)
            self.assertIn('skills/quartz-validation/v1/SKILL.md',archive.namelist());self.assertNotIn(b'Private unrelated',archive.read('skills.json'))
    def test_concurrent_updates_are_atomic_and_invalid_inputs_rejected(self):
        self.assertTrue(self.save()['ok']);results=[]
        def update():
            try:results.append(self.runtime.skills.save(self.runtime.get(self.sid),{'id':'quartz-validation','name':'Quartz','description':'Parser','content':'Procedure','reason':'Concurrent improvement','expectedRevision':1},[]))
            except ValueError as e:results.append(str(e))
        threads=[threading.Thread(target=update) for _ in range(2)]
        for thread in threads:thread.start()
        for thread in threads:thread.join()
        self.assertEqual(sum(isinstance(r,dict) for r in results),1)
        for args in ({'id':'../escape'},{'expectedRevision':True},{'content':''},{'enabled':'yes'}):self.assertFalse(self.save(**args)['ok'])
        self.assertFalse(self.tool('skill_search',query='')['ok'])
        self.assertFalse(self.tool('skill_list',limit=True)['ok'])
    def test_failed_command_does_not_certify_skill(self):
        call=uuid.uuid4().hex
        result=self.runtime.dispatch({'op':'tool','session':self.sid,'tool':'run_command','callId':call,'args':{'command':sys.executable,'args':['-c','raise SystemExit(1)']}})
        self.assertEqual(result['result']['exitCode'],1)
        saved=self.save(evidenceCallIds=[call]);self.assertTrue(saved['ok']);self.assertEqual(saved['result']['evidenceStatus'],'unverified')
        self.assertEqual(saved['result']['evidence'][0]['exitCode'],1)
    def test_database_symlink_rejected(self):
        from server.agent_skills import Skills
        target=self.root/'external';target.write_text('untouched');link=self.root/'symlink';link.symlink_to(target)
        with self.assertRaises(ValueError):Skills(link)
        self.assertEqual(target.read_text(),'untouched')

if __name__=='__main__':unittest.main()
