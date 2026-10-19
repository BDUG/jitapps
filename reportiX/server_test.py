import importlib.util, json, pathlib, tempfile, threading, unittest, urllib.error, urllib.request
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('reportix_server',ROOT/'server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory()
  class Quiet(server.Handler):
   def log_message(self,*args):pass
  cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),lambda *a,**kw:Quiet(*a,directory=str(server.ROOT),**kw));cls.http.allowed_origins=set();cls.http.store=server.relay.relay_config.Store(str(pathlib.Path(cls.tmp.name)/'providers.json'));cls.http.search_store=server.google_search.Store(pathlib.Path(cls.tmp.name)/'search.json');cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start();cls.base='http://127.0.0.1:'+str(cls.http.server_port)
 @classmethod
 def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.thread.join();cls.tmp.cleanup()
 def post(self,data,headers=None):return urllib.request.urlopen(urllib.request.Request(self.base+'/api/research',data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Architex-Request':'1',**(headers or {})}),timeout=10)
 def test_health_and_app(self):
  with urllib.request.urlopen(self.base+'/api/research/health') as r:self.assertEqual(json.load(r)['service'],'reportix')
  with urllib.request.urlopen(self.base+'/reportiX/') as r:self.assertIn(b'Research studio',r.read())
 def test_blocked_target_and_bad_input(self):
  with self.post({'query':'Example research','urls':['http://127.0.0.1/'],'search':False}) as r:
   data=json.load(r);self.assertFalse(data['sources']);self.assertTrue(data['errors'])
  with self.assertRaises(urllib.error.HTTPError) as error:self.post({'query':''})
  self.assertEqual(error.exception.code,400)
 def test_google_settings(self):
  url=self.base+'/api/research/settings'
  req=urllib.request.Request(url,data=json.dumps({'apiKey':'fake-server-test-key','engineId':'engine-server-test'}).encode(),headers={'Content-Type':'application/json','X-Architex-Request':'1'})
  with urllib.request.urlopen(req) as r:data=json.load(r);self.assertTrue(data['configured']);self.assertNotIn('fake-server-test-key',json.dumps(data))
  with urllib.request.urlopen(urllib.request.Request(url,headers={'X-Architex-Request':'1'})) as r:self.assertTrue(json.load(r)['keyConfigured'])
  with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(url)
  self.assertEqual(error.exception.code,403)
 def test_google_routes_to_crawler(self):
  hits=[{'url':'https://example.org/study','title':'Study','snippet':'Google result'}]
  def research(data,searcher):
   self.assertEqual(data['searchProvider'],'google');self.assertEqual(searcher(data['query']),hits);return {'sources':[],'discovered':hits,'searchProvider':'google'}
  with patch.object(server.google_search,'search',return_value=hits) as google,patch.object(server.crawler,'research',side_effect=research):
   with self.post({'query':'Research topic','searchProvider':'google'}) as r:self.assertEqual(json.load(r)['discovered'],hits)
   google.assert_called_once()
 def test_cross_origin_rejected(self):
  with self.assertRaises(urllib.error.HTTPError) as error:self.post({'query':'A query'},{'Origin':'https://untrusted.example'})
  self.assertEqual(error.exception.code,403)
if __name__=='__main__':unittest.main()
