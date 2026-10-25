import base64
import json
from functools import partial
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from server import image_provider,relay_config
from server.server import Handler
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
class Upstream(BaseHTTPRequestHandler):
    calls=[]
    def log_message(self,*args):pass
    def do_POST(self):
        self.__class__.calls.append((self.path,self.headers, self.rfile.read(int(self.headers['Content-Length']))))
        body=json.dumps({'data':[{'b64_json':PNG.split(',')[1]}]}).encode()
        self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
class Quiet(Handler):
    def log_message(self,*args):pass
class ImagesTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.upstream=ThreadingHTTPServer(('127.0.0.1',0),Upstream);threading.Thread(target=self.upstream.serve_forever,daemon=True).start();self.addCleanup(self.upstream.server_close);self.addCleanup(self.upstream.shutdown)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=self.temp.name));self.server.store=relay_config.Store(Path(self.temp.name)/'providers.json');self.server.allowed_origins=set();threading.Thread(target=self.server.serve_forever,daemon=True).start();self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.base=f'http://127.0.0.1:{self.server.server_port}'
    def post(self,path,data,admin=False,headers=True):
        req=urllib.request.Request(self.base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json',**({'X-Architex-Admin' if admin else 'X-Architex-Request':'1'} if headers else {})})
        try:
            with urllib.request.urlopen(req) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def test_full_image_protocol_and_private_config(self):
        endpoint=f'http://127.0.0.1:{self.upstream.server_port}'
        code,config=self.post('/api/admin/images',{'generationEndpoint':endpoint+'/generate','editEndpoint':endpoint+'/edit','model':'test-image','apiKey':'secret-image-key'},True)
        self.assertEqual(code,200);self.assertTrue(config['hasApiKey']);self.assertNotIn('apiKey',config)
        self.assertEqual(self.post('/api/images',{'operation':'generate','prompt':'A flower'})[0],200)
        code,result=self.post('/api/images',{'operation':'edit','prompt':'Blue flower','image':PNG,'mask':PNG,'reference':PNG})
        self.assertEqual(code,200);self.assertEqual(result['image'],PNG)
        path,headers,body=Upstream.calls[-1];self.assertEqual(path,'/edit');self.assertIn(b'name="mask"',body);self.assertEqual(body.count(b'name="image[]"'),2);self.assertEqual(headers['Authorization'],'Bearer secret-image-key')
        self.assertEqual(image_provider.config_path(self.server).stat().st_mode&0o777,0o600)
        with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(self.base+'/providers.images.json')
        self.assertEqual(error.exception.code,404)
        self.assertEqual(self.post('/api/admin/images',{'action':'read'},True)[1]['hasApiKey'],True)
        self.assertEqual(self.post('/api/images',{'operation':'generate','prompt':'Hi'},headers=False)[0],403)
    def test_invalid_inputs_never_reach_provider(self):
        calls=len(Upstream.calls)
        self.assertEqual(self.post('/api/images',{'operation':'edit','prompt':'Hi','image':'https://host/image','mask':PNG})[0],502)
        self.assertEqual(len(Upstream.calls),calls)
        with self.assertRaises(ValueError):image_provider.normalize({'generationEndpoint':'https://user:pass@host/api'}, {})
        with self.assertRaises(ValueError):image_provider.png('data:image/png;base64,!!!!')
        old=dict(image_provider.DEFAULT,apiKey='secret');new=dict(old,generationEndpoint='https://other.example/images/generations');new.pop('apiKey');self.assertEqual(image_provider.normalize(new,old)['apiKey'],'')
    def test_image_cors(self):
        self.server.allowed_origins={'https://app.example'}
        req=urllib.request.Request(self.base+'/api/images',method='OPTIONS',headers={'Origin':'https://app.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-architex-request'})
        with urllib.request.urlopen(req) as response:self.assertEqual(response.status,204);self.assertEqual(response.headers['Access-Control-Allow-Origin'],'https://app.example')
if __name__=='__main__':unittest.main()
