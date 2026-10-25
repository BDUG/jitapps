import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
import zipfile
from server.agent_memory import Memory
from server.agent_runtime import Runtime

class MemoryPackageTests(unittest.TestCase):
    def test_persistence_paging_isolation_and_replacement(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'memory.sqlite3';memory=Memory(path)
            text='quartz calibration decision '+('working context '*500)+' final unique detail'
            memory.store('one',text,document='decision',source='design.md')
            memory.store('two','quartz private other session',document='private')
            memory=Memory(path)
            result=memory.search('one','quartz calibration',limit=1)
            self.assertEqual(result['matches'][0]['id'],'decision')
            self.assertEqual(result['matches'][0]['source'],'design.md')
            pages=[];cursor=0
            while True:
                page=memory.read('one','decision',cursor,1);pages.extend(page['chunks'])
                if page['done']:break
                cursor=page['nextCursor']
            self.assertGreater(len(pages),1);self.assertIn('final unique detail',pages[-1]['text'])
            self.assertNotIn('private',json.dumps(memory.export('one')))
            self.assertEqual(memory.delete('one','private')['deletedChunks'],0)
            memory.store('one','replacement calibration',document='decision')
            self.assertEqual(memory.read('one','decision')['total'],1)
            self.assertEqual(memory.delete('one','decision')['deletedChunks'],1)
            self.assertEqual(memory.list('one')['total'],0)

    def test_package_actual_files_scripts_logs_and_hashes(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'old.txt').write_text('before\n');(root/'gone.txt').write_text('remove\n')
            runtime=Runtime(root,[sys.executable]);session=runtime.start({'goal':'package evidence','allowEdits':True,'allowCommands':True});sid=session['id']
            def tool(name,**args):
                result=runtime.dispatch({'op':'tool','session':sid,'tool':name,'args':args,'callId':uuid.uuid4().hex})
                self.assertTrue(result['ok'],result);return result['result']
            try:
                observed=tool('read_file',path='old.txt')
                indexed=tool('memory_search',query='before',collection='observations')
                self.assertTrue(indexed['matches']);self.assertEqual(indexed['matches'][0]['metadata']['hash'],observed['hash'])
                tool('write_file',path='old.txt',content='after\n',expectedHash=observed['hash'])
                gone=tool('read_file',path='gone.txt');tool('delete_file',path='gone.txt',expectedHash=gone['hash'])
                tool('write_script',path='verify.py',content='print("quartz verified")\nprint("x"*20000)')
                tool('run_script',path='verify.py',command=sys.executable)
                tool('memory_store',text='quartz design decision',source='user')
                self.assertTrue(tool('memory_search',query='quartz')['matches'])
                binary=b'\x00\xff'+bytes(range(256))*1000;(root/'image.bin').write_bytes(binary)
                config=root/'providers.json';config.write_text('SECRET');runtime.private_paths.add(config.resolve())
                other=runtime.start({'goal':'other','allowEdits':False});runtime.memory.store(other['id'],'PRIVATE OTHER SESSION')
                archive=runtime.package(runtime.get(sid))
                with zipfile.ZipFile(archive) as z:
                    manifest=json.loads(z.read('manifest.json'))
                    for item in manifest['files']:
                        value=z.read(item['path']);self.assertEqual(len(value),item['bytes']);self.assertEqual(hashlib.sha256(value).hexdigest(),item['sha256'])
                    self.assertEqual(z.read('changes/image.bin'),binary)
                    self.assertEqual(z.read('changes/old.txt'),b'after\n')
                    self.assertIn('gone.txt',manifest['deleted']);self.assertIn(b'-before',z.read('changes.patch'))
                    self.assertIn('scripts/verify.py',z.namelist())
                    self.assertTrue(any(len(z.read(n))>20000 for n in z.namelist() if n.startswith('logs/')))
                    self.assertNotIn(b'PRIVATE OTHER SESSION',z.read('memory.json'))
                    self.assertNotIn('changes/providers.json',z.namelist())
                    self.assertFalse(any('memory.sqlite' in n or '/backups/' in n for n in z.namelist()))
            finally:runtime.close()

if __name__=='__main__':unittest.main()
