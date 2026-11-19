import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from server.projects import Projects, Conflict


class ProjectsTests(unittest.TestCase):
    def setUp(self):
        self.temp=self.enterContext(tempfile.TemporaryDirectory())
        self.store=Projects(Path(self.temp)/'projects')
        self.data={'action':'save','app':'rstiX','name':'Requirements','state':{'model':{'files':[]},'draft':'keep'},'files':[{'path':'docs/a.rst','content':'Grüße\n'}],'folders':['empty/deep']}
    def test_projects_keep_own_roots_real_bytes_empty_folders_and_drafts_after_restart(self):
        first=self.store.dispatch(self.data);second=self.store.dispatch(self.data)
        self.assertNotEqual(first['root'],second['root'])
        self.assertEqual((Path(first['filesRoot'])/'docs/a.rst').read_text(),'Grüße\n')
        reopened=Projects(self.store.root).dispatch({'action':'open','app':'rstiX','id':first['id']})
        self.assertEqual(reopened['state']['draft'],'keep')
        self.assertIn('empty/deep',reopened['folders'])
        self.assertEqual(base64.b64decode(reopened['files'][0]['content']).decode(),'Grüße\n')
        self.assertEqual(len(self.store.dispatch({'action':'list','app':'rstiX'})['projects']),2)
        self.assertEqual(self.store.dispatch({'action':'list','app':'mergiX'})['projects'],[])
    def test_revision_guard_and_deleted_files_keep_previous_revision(self):
        first=self.store.dispatch(self.data)
        second=self.store.dispatch({**self.data,'id':first['id'],'expectedRevision':1,'files':[]})
        self.assertEqual(second['revision'],2)
        self.assertTrue((Path(first['filesRoot'])/'docs/a.rst').exists())
        self.assertEqual(self.store.dispatch({'action':'open','app':'rstiX','id':first['id']})['files'],[])
        with self.assertRaises(Conflict):self.store.dispatch({**self.data,'id':first['id'],'expectedRevision':1})
        with self.assertRaises(ValueError):self.store.dispatch({'action':'open','app':'mergiX','id':first['id']})
    def test_invalid_paths_and_duplicate_files_never_publish(self):
        for path in ['../escape','/tmp/escape','a/../b','a\\b','a//b','a/./b','C:/bad','a\x00b']:
            with self.subTest(path=path),self.assertRaises(ValueError):self.store.dispatch({**self.data,'files':[{'path':path,'content':'bad'}]})
        for files in [[{'path':'a','content':'x'},{'path':'a','content':'y'}],[{'path':'a','content':'x'},{'path':'a/b','content':'y'}]]:
            with self.assertRaises(ValueError):self.store.dispatch({**self.data,'files':files})
        self.assertEqual(self.store.dispatch({'app':'rstiX','action':'list'})['projects'],[])
    def test_failed_commit_keeps_head_and_orphan_revision_is_recoverable(self):
        first=self.store.dispatch(self.data)
        import server.projects as module
        original=module.atomic
        def fail_head(path,value):
            if path.name=='HEAD.json':raise OSError('disk full')
            return original(path,value)
        with patch.object(module,'atomic',side_effect=fail_head),self.assertRaises(OSError):
            self.store.dispatch({**self.data,'id':first['id'],'expectedRevision':1})
        self.assertEqual(self.store.dispatch({'action':'open','app':'rstiX','id':first['id']})['revision'],1)
        self.store.dispatch({**self.data,'id':first['id'],'expectedRevision':1})
        self.assertTrue(list((Path(first['root'])/'revisions').glob('orphan-*')))
    def test_symlink_files_are_rejected(self):
        first=self.store.dispatch(self.data)
        target=Path(first['filesRoot'])/'docs/a.rst';target.unlink();target.symlink_to(Path(self.temp)/'outside')
        with self.assertRaisesRegex(ValueError,'Symlinks'):self.store.dispatch({'action':'open','app':'rstiX','id':first['id']})

    def test_two_stores_cannot_publish_the_same_revision(self):
        from concurrent.futures import ThreadPoolExecutor
        first=self.store.dispatch(self.data)
        other=Projects(self.store.root)
        def save(store):
            try:return store.dispatch({**self.data,'id':first['id'],'expectedRevision':1})['revision']
            except Conflict:return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(save,[self.store,other]))
        self.assertCountEqual(results,[2,'conflict'])

    def test_binary_files_are_not_decoded_as_text(self):
        original=b'\x00\xff\xfe\r\n'
        first=self.store.dispatch({**self.data,'files':[{'path':'binary.dat','encoding':'base64','content':base64.b64encode(original).decode()}]})
        self.assertEqual((Path(first['filesRoot'])/'binary.dat').read_bytes(),original)
        loaded=self.store.dispatch({'action':'open','id':first['id'],'app':'rstiX'})
        self.assertEqual(base64.b64decode(loaded['files'][0]['content']),original)
