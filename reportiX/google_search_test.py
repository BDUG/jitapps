import io,json,os,pathlib,tempfile,unittest,urllib.error,urllib.parse
from unittest.mock import patch
import google_search
class Tests(unittest.TestCase):
 def test_request_and_results(self):
  def opener(req,timeout):
   parsed=urllib.parse.urlsplit(req.full_url);self.assertEqual(parsed.hostname,'customsearch.googleapis.com');params=urllib.parse.parse_qs(parsed.query);self.assertEqual(params['q'],['solar energy']);self.assertEqual(params['cx'],['engine-test']);self.assertEqual(params['num'],['10']);self.assertEqual(timeout,12)
   return io.BytesIO(json.dumps({'items':[{'link':'https://example.org/study','title':'Evidence','snippet':'Source snippet'},{'link':'javascript:bad()','title':'Ignore'}]}).encode())
  result=google_search.search('solar energy',{'apiKey':'fake-test-key','engineId':'engine-test'},opener=opener);self.assertEqual(len(result),1);self.assertEqual(result[0]['title'],'Evidence')
 def test_missing_configuration(self):
  with self.assertRaisesRegex(ValueError,'requires an API key'):google_search.search('query',{})
 def test_sanitized_provider_errors(self):
  def opener(req,timeout):raise urllib.error.HTTPError(req.full_url,403,'Forbidden',{},None)
  with self.assertRaises(ValueError) as error:google_search.search('query',{'apiKey':'fake-sensitive-key','engineId':'cx'},opener=opener)
  self.assertIn('403',str(error.exception));self.assertNotIn('fake-sensitive-key',str(error.exception))
 def test_store_and_retention(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'REPORTIX_GOOGLE_API_KEY':'','REPORTIX_GOOGLE_ENGINE_ID':''}):
   store=google_search.Store(pathlib.Path(root)/'search.json');self.assertFalse(store.snapshot()['configured']);saved=store.save({'apiKey':'fake-test-key','engineId':'engine-test'});self.assertTrue(saved['configured']);self.assertNotIn('fake-test-key',json.dumps(saved));self.assertEqual(store.path.stat().st_mode&0o777,0o600);store.save({'apiKey':'','engineId':'changed'});self.assertEqual(store.effective()['apiKey'],'fake-test-key');self.assertFalse(store.save({'clearKey':True})['keyConfigured'])
 def test_environment_override(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'REPORTIX_GOOGLE_API_KEY':'environment-test-key','REPORTIX_GOOGLE_ENGINE_ID':'environment-engine'}):
   store=google_search.Store(pathlib.Path(root)/'search.json');self.assertTrue(store.snapshot()['keyFromEnvironment']);self.assertTrue(store.snapshot()['engineFromEnvironment']);self.assertTrue(store.snapshot()['configured']);self.assertNotIn('environment-test-key',json.dumps(store.snapshot()))
if __name__=='__main__':unittest.main()
