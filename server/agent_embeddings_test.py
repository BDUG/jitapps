import os
import hashlib
import json
from array import array
from contextlib import closing
from pathlib import Path
import tempfile
import unittest
from server.agent_embeddings import LocalEmbeddings
from server.agent_memory import Memory, MODEL

class EmbeddingsTests(unittest.TestCase):
    def test_missing_model_is_actionable(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError,'model.onnx'):LocalEmbeddings(folder)
    def test_explicit_fallback_when_inference_fails(self):
        class Broken:
            model='broken-model';dimensions=384
            def embed_many(self,texts):raise ValueError('Inference unavailable')
        with tempfile.TemporaryDirectory() as folder:
            memory=Memory(Path(folder)/'memory.sqlite3',Broken())
            result=memory.store('s','password reset instructions')
            self.assertIn('semanticError',result)
            found=memory.search('s','password')
            self.assertFalse(found['semantic']);self.assertIn('semanticError',found);self.assertEqual(found['model'],MODEL)

    def test_semantic_pages_match_dense_reference_with_negative_scores_and_ties(self):
        class Learned:
            model='fixture-learned-v1';dimensions=8
            def embed(self,text):
                fixed={'axis':[1.,0.,0.,0.,0.,0.,0.,0.],'flip':[-1.,0.,0.,0.,0.,0.,0.,0.],
                       'zero':[0.]*8,'positive':[1.,0.,0.,0.,0.,0.,0.,0.],
                       'negative':[-1.,0.,0.,0.,0.,0.,0.,0.]}
                if text in fixed:return fixed[text]
                digest=hashlib.sha256(text.encode()).digest()
                return [(v-128)/128 for v in digest[:8]]
            def embed_many(self,texts):return [self.embed(text) for text in texts]
        with tempfile.TemporaryDirectory() as folder:
            memory=Memory(Path(folder)/'memory.sqlite3',Learned())
            for index in range(80):
                memory.store('one','source '+str(index)+' quartz',document=f'doc-{index:03}',
                             collection='notes' if index%2 else 'observations',metadata={'index':index})
            for ident,text in [('tie-z','positive'),('tie-a','positive'),('zero','zero'),('negative','negative')]:
                memory.store('one',text,document=ident)
            memory.store('private','positive',document='other-session')
            for query in ['axis','flip','zero']:
                for collection in [None,'notes']:
                    expected=[];weights=memory.semantic.embed(query)
                    with closing(memory.connect()) as db:
                        for row in db.execute('SELECT c.*,s.embedding AS learned FROM chunks c JOIN semantic_vectors s USING(session,document,part) WHERE c.session=? AND s.model=?',('one',memory.semantic.model)):
                            if collection and row['collection']!=collection:continue
                            values=array('f');values.frombytes(row['learned'])
                            score=sum(a*b for a,b in zip(weights,values))
                            expected.append((score,dict(row)))
                    expected.sort(key=lambda item:(-item[0],item[1]['document'],item[1]['part']))
                    for cursor in [0,3,80,1000]:
                        with self.subTest(query=query,collection=collection,cursor=cursor):
                            page=memory.search('one',query,limit=7,collection=collection,cursor=cursor)
                            self.assertTrue(page['semantic'])
                            self.assertEqual([(r['id'],r['part'],r['score'],r['text'],r['metadata']) for r in page['matches']],[(r['document'],r['part'],round(score,6),r['content'],json.loads(r['metadata'])) for score,r in expected[cursor:cursor+7]])
                            self.assertEqual(page['matchedChunks'],len(expected))
                            self.assertEqual(page['nextCursor'],cursor+len(page['matches']))
                            self.assertEqual(page['done'],cursor+len(page['matches'])>=len(expected))
            memory.delete('one','tie-a')
            self.assertNotIn('tie-a',[r['id'] for r in memory.search('one','axis',limit=100)['matches']])
            memory.store('one','negative',document='tie-z')
            result=memory.search('one','axis',limit=100)
            self.assertEqual(next(r for r in result['matches'] if r['id']=='tie-z')['score'],-1.)
            with closing(memory.connect()) as db,db:
                db.execute('UPDATE semantic_vectors SET embedding=? WHERE session=? AND document=?',(array('f',[1.,2.]).tobytes(),'one','negative'))
            fallback=memory.search('one','negative')
            self.assertFalse(fallback['semantic']);self.assertIn('dimensions',fallback['semanticError'])

    def test_semantic_search_preserves_incremental_legacy_coverage(self):
        class Learned:
            model='fixture-progress';dimensions=2
            def embed(self,text):return [1.,0.]
            def embed_many(self,texts):return [[1.,0.] for _ in texts]
        with tempfile.TemporaryDirectory() as folder:
            memory=Memory(Path(folder)/'memory.sqlite3')
            for index in range(40):memory.store('one','legacy source '+str(index),document='legacy-'+str(index))
            memory.semantic=Learned()
            first=memory.search('one','source')
            self.assertEqual(first['matchedChunks'],32);self.assertEqual(first['indexing']['remaining'],8)
            second=memory.search('one','source')
            self.assertEqual(second['matchedChunks'],40);self.assertTrue(second['indexing']['done'])
            self.assertEqual(memory.search('absent','source')['matches'],[])

    @unittest.skipUnless(os.environ.get('SUITE_EMBEDDING_TEST_DIR'),'Set SUITE_EMBEDDING_TEST_DIR for real learned-model checks')
    def test_real_onnx_semantic_ranking_and_legacy_reindex(self):
        backend=LocalEmbeddings(os.environ['SUITE_EMBEDDING_TEST_DIR'])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'memory.sqlite3';legacy=Memory(path);legacy.store('s','To recover account credentials, send a reset link to the registered email.','manual',document='credentials');legacy.store('s','Recipe: stir flour, eggs and cocoa to bake chocolate muffins.','cookbook',document='cake')
            memory=Memory(path,backend);result=memory.search('s','I forgot my password and cannot sign in')
            self.assertTrue(result['semantic']);self.assertEqual(result['matches'][0]['id'],'credentials');self.assertEqual(result['dimensions'],384);self.assertTrue(result['indexing']['done']);self.assertGreater(result['matches'][0]['score'],result['matches'][1]['score']+.15)
            saved=memory.store('s','Save a copy before changing application settings.',document='backup');self.assertNotEqual(saved['model'],MODEL)
            self.assertEqual(memory.search('other','password')['matches'],[])
            memory.store('s','The credentials note now contains only a cake recipe.',document='credentials');self.assertEqual(memory.read('s','credentials')['chunks'][0]['text'],'The credentials note now contains only a cake recipe.')
            memory.delete('s','backup');self.assertFalse(any(r['id']=='backup' for r in memory.search('s','backup')['matches']))
