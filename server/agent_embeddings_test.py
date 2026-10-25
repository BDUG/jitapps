import os
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
