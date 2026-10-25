import hashlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from server.agent_runtime import Runtime

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);(self.root/'source.txt').write_bytes(b'old\rvalue');(self.root/'empty.txt').write_bytes(b'');self.runtime=Runtime(self.root,[]);self.session=self.runtime.start({'goal':'Inspect edits','allowEdits':True});self.id=self.session['id'];self.calls=0
    def tearDown(self):self.runtime.close();self.tmp.cleanup()
    def call(self,op,**data):return self.runtime.dispatch({'op':op,'session':self.id,**data})
    def tool(self,name,**args):
        self.calls+=1;value=self.call('tool',tool=name,args=args,callId='call'+str(self.calls));self.assertTrue(value['ok'],value);return value['result']
    def write(self,path,value):
        p=self.root/path;expected=hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else 'missing';return self.tool('write_file',path=path,content=value,expectedHash=expected)['hash']
    def apply(self,patch,path,original,expected):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);target=base/path;target.parent.mkdir(parents=True,exist_ok=True)
            if original is not None:target.write_bytes(original)
            p=base/'review.patch';p.write_bytes(patch.encode('utf-8'));r=subprocess.run(['git','apply',str(p)],cwd=base,capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr)
            self.assertEqual(target.read_bytes() if target.exists() else None,expected)
    def test_preview_paging_and_applicable_patch(self):
        changed='new\rvalue\n'+'😀'*20;sha=self.write('source.txt',changed);first=self.call('change_preview',path='source.txt',expectedHash=sha,limit=7)
        self.assertEqual(first['baselineKind'],'recovery');self.assertIn('first file-tool edit',first['baselineNote']);parts=[];offset=0
        while True:
            page=self.call('change_preview',path='source.txt',expectedHash=sha,expectedBeforeHash=first['beforeHash'],offset=offset,limit=7);parts.append(page['after']['text'])
            if page['done']:break
            offset=page['nextOffset']
        self.assertEqual(''.join(parts),changed);patch=self.call('change_patch',path='source.txt',expectedHash=sha,expectedBeforeHash=first['beforeHash'])['patch'];self.assertIn('No newline at end of file',patch);self.apply(patch,'source.txt',b'old\rvalue',changed.encode())
    def test_add_delete_empty_unicode_and_quoted_paths(self):
        for name,content in [('new.txt','hello'),('blank.txt',''),('space ä "quoted".txt','Unicode\n')]:
            sha=self.write(name,content);patch=self.call('change_patch',path=name,expectedHash=sha)['patch'];self.apply(patch,name,None,content.encode())
        self.tool('delete_file',path='empty.txt',expectedHash=hashlib.sha256(b'').hexdigest());patch=self.call('change_patch',path='empty.txt',expectedHash='missing')['patch'];self.apply(patch,'empty.txt',b'',None)
        self.tool('delete_file',path='source.txt',expectedHash=hashlib.sha256(b'old\rvalue').hexdigest());patch=self.call('change_patch',path='source.txt',expectedHash='missing')['patch'];self.apply(patch,'source.txt',b'old\rvalue',None)
    def test_unavailable_binary_and_revision_guards(self):
        (self.root/'source.txt').write_text('command-only edit');sha=hashlib.sha256(b'command-only edit').hexdigest();p=self.call('change_preview',path='source.txt',expectedHash=sha);self.assertFalse(p['before']['available']);self.assertFalse(p['patchAvailable'])
        with self.assertRaisesRegex(ValueError,'recovery copy'):self.call('change_patch',path='source.txt',expectedHash=sha)
        sha=self.write('source.txt','after tool edit');p=self.call('change_preview',path='source.txt',expectedHash=sha);backup=self.runtime.get(self.id)['backups']['source.txt'];(self.runtime.get(self.id)['_dir']/'backups'/backup['id']).write_bytes(b'changed recovery')
        with self.assertRaisesRegex(ValueError,'Recovery copy changed'):self.call('change_preview',path='source.txt',expectedHash=sha,expectedBeforeHash=p['beforeHash'])
        (self.root/'source.txt').write_bytes(b'\0binary');binary_hash=hashlib.sha256(b'\0binary').hexdigest();p=self.call('change_preview',path='source.txt',expectedHash=binary_hash);self.assertTrue(p['after']['binary']);self.assertFalse(p['patchAvailable'])
        with self.assertRaisesRegex(ValueError,'File changed'):self.call('change_patch',path='source.txt',expectedHash=sha)
        with self.assertRaisesRegex(ValueError,'Binary'):self.call('change_patch',path='source.txt',expectedHash=binary_hash)
    def test_live_inspector_while_tool_running_is_readonly(self):
        sha=self.write('source.txt','during run');session=self.runtime.get(self.id);events=list(session['events']);session['_running']=True
        try:
            with self.assertRaisesRegex(ValueError,'active tool'):self.call('change_preview',path='source.txt',expectedHash=sha)
            preview=self.call('inspect_preview',path='source.txt',expectedHash=sha);self.assertEqual(preview['after']['text'],'during run')
            patch=self.call('inspect_patch',path='source.txt',expectedHash=sha,expectedBeforeHash=preview['beforeHash']);self.assertIn('+during run',patch['patch']);self.assertEqual(session['events'],events);self.assertTrue(session['_running'])
            (self.root/'source.txt').write_text('newer edit')
            with self.assertRaisesRegex(ValueError,'File changed'):self.call('inspect_preview',path='source.txt',expectedHash=sha)
            with self.assertRaises(ValueError):self.call('inspect_preview',path='../outside',expectedHash='missing')
        finally:session['_running']=False

    def test_review_does_not_require_edit_permission_or_mutate_audit(self):
        readonly=self.runtime.start({'goal':'Read only review','allowEdits':False});(self.root/'external.txt').write_text('external content');sha=hashlib.sha256(b'external content').hexdigest()
        before=(self.root/'external.txt').read_bytes();events=list(self.runtime.get(readonly['id'])['events'])
        self.runtime.dispatch({'op':'change_preview','session':readonly['id'],'path':'external.txt','expectedHash':sha})
        patch=self.runtime.dispatch({'op':'change_patch','session':readonly['id'],'path':'external.txt','expectedHash':sha})
        self.assertIn('external content',patch['patch']);self.assertEqual(self.runtime.get(readonly['id'])['events'],events);self.assertEqual((self.root/'external.txt').read_bytes(),before);self.assertFalse(self.runtime.get(readonly['id'])['allowEdits'])

    def test_private_paths_symlinks_and_busy_tool(self):
        for path in ['../outside','.suite-agent/session.json','.env','/etc/passwd']:
            with self.assertRaises((ValueError,PermissionError)):self.call('change_preview',path=path,expectedHash='missing')
        sha=self.write('source.txt','new');s=self.runtime.get(self.id);backup=s['_dir']/'backups'/s['backups']['source.txt']['id'];backup.unlink();backup.symlink_to(self.root/'source.txt')
        with self.assertRaises(PermissionError):self.call('change_preview',path='source.txt',expectedHash=sha)
        s['_running']=True
        with self.assertRaisesRegex(ValueError,'active tool'):self.call('change_preview',path='source.txt',expectedHash=sha)
        s['_running']=False
