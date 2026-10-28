import hashlib
from array import array
from contextlib import closing
from server.agent_memory import vector
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

    def test_lexical_pages_match_dense_reference_and_stable_ties(self):
        with tempfile.TemporaryDirectory() as folder:
            memory=Memory(Path(folder)/'memory.sqlite3')
            for n in range(80):memory.store('one',f'quartz calibration module {n} branch '+('signal '*(n%5+1)),document=f'doc-{n:03}',collection='notes' if n%2 else 'observations')
            for document in ['tie-z','tie-a']:memory.store('one','quartz calibration exact match',document=document)
            memory.store('other','quartz calibration private',document='private')
            for query in ['quartz calibration','signal branch','no-such-word','!!!']:
                for collection in [None,'notes']:
                    weights=vector(query);expected=[]
                    with closing(memory.connect()) as db:
                        for row in db.execute('SELECT * FROM chunks WHERE session=?',('one',)):
                            if collection and row['collection']!=collection:continue
                            values=array('f');values.frombytes(row['embedding'])
                            score=sum(a*b for a,b in zip(weights,values))
                            if score>0:expected.append((score,row['document'],row['part']))
                    expected.sort(key=lambda item:(-item[0],item[1],item[2]))
                    for cursor in [0,3,40,1000]:
                        with self.subTest(query=query,collection=collection,cursor=cursor):
                            page=memory.search('one',query,limit=3,collection=collection,cursor=cursor)
                            self.assertEqual([(r['score'],r['id'],r['part']) for r in page['matches']],[(round(score,6),document,part) for score,document,part in expected[cursor:cursor+3]])
                            self.assertEqual(page['matchedChunks'],len(expected));self.assertEqual(page['nextCursor'],cursor+len(page['matches']));self.assertEqual(page['done'],cursor+len(page['matches'])>=len(expected))
            memory.delete('one','tie-a');self.assertNotIn('tie-a',[r['id'] for r in memory.search('one','quartz calibration',limit=100)['matches']])

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
