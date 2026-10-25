import json
from pathlib import Path
import tempfile
import threading
import unittest
from server.google_device import DeviceLogin,ProviderError

class DeviceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'google-device.json';self.now=0;self.calls=[];self.responses=[]
        def transport(url,fields=None,access_token=None):
            self.calls.append((url,fields,access_token));value=self.responses.pop(0)
            if isinstance(value,Exception):raise value
            if callable(value):return value()
            return value
        self.service=DeviceLogin(self.path,transport,clock=lambda:self.now)
        self.service.configure({'clientId':'device.apps.googleusercontent.com','clientSecret':'private-secret'})
    def tearDown(self):self.tmp.cleanup()
    def start(self):
        self.responses.append({'device_code':'private-device-code','user_code':'ABCD-EFGH','verification_url':'https://www.google.com/device','expires_in':60,'interval':5});return self.service.start()
    def test_private_configuration_and_start(self):
        status=self.service.status();self.assertTrue(status['hasSecret']);self.assertNotIn('private-secret',json.dumps(status));self.assertEqual(self.path.stat().st_mode&0o777,0o600)
        result=self.start();self.assertNotIn('private-device-code',json.dumps(result));self.assertNotIn('private-secret',json.dumps(result));self.assertEqual(self.calls[-1][1]['scope'],'openid email profile')
        self.service.configure({'clientId':'device.apps.googleusercontent.com','clientSecret':''});self.assertTrue(self.service.status()['hasSecret'])
        with self.assertRaises(ValueError):self.service.configure({'clientId':'other.apps.googleusercontent.com','clientSecret':''})
    def test_poll_interval_pending_slowdown_and_complete(self):
        grant=self.start();id=grant['session'];self.assertEqual(self.service.poll(id)['interval'],5);self.assertEqual(len(self.calls),1)
        self.now=5;self.responses.append({'error':'authorization_pending'});self.assertEqual(self.service.poll(id)['state'],'pending');self.now=10;self.responses.append({'error':'slow_down'});self.assertEqual(self.service.poll(id)['interval'],10);self.now=15;self.service.poll(id);self.assertEqual(len(self.calls),3)
        self.now=20;self.responses.extend([{'access_token':'private-access','refresh_token':'private-refresh','expires_in':3600},{'sub':'123','name':'Test person','email':'test@example.com','email_verified':True}]);result=self.service.poll(id);self.assertEqual(result['state'],'complete');self.assertTrue(result['profile']['verified']);self.assertEqual(result['profile']['method'],'device');self.assertNotIn('private-',json.dumps(result));self.assertEqual(self.calls[-1][2],'private-access');self.assertEqual(self.calls[-2][1]['grant_type'],'urn:ietf:params:oauth:grant-type:device_code');self.assertNotIn(id,self.service.grants)
    def test_expiry_denial_cancellation_and_retry(self):
        id=self.start()['session'];self.now=60;self.assertEqual(self.service.poll(id)['state'],'expired')
        id=self.start()['session'];self.now+=5;self.responses.append({'error':'access_denied'});self.assertEqual(self.service.poll(id)['state'],'failed')
        id=self.start()['session'];self.service.cancel(id)
        with self.assertRaises(ValueError):self.service.poll(id)
        id=self.start()['session'];self.now+=5;self.responses.append(ProviderError('offline'))
        with self.assertRaises(ProviderError):self.service.poll(id)
        self.assertFalse(self.service.grants[id]['busy']);self.assertEqual(self.service.poll(id)['state'],'pending')
    def test_approved_grant_with_failed_identity_stops(self):
        id=self.start()['session'];self.now=5;self.responses.extend([{'access_token':'private-access','expires_in':3600},ProviderError('offline')]);result=self.service.poll(id);self.assertEqual(result['state'],'failed');self.assertNotIn(id,self.service.grants)

    def test_cancel_during_token_request_and_untrusted_url(self):
        id=self.start()['session'];self.now=5
        def response():self.service.cancel(id);return {'access_token':'discarded','expires_in':3600}
        self.responses.append(response);self.assertEqual(self.service.poll(id)['state'],'cancelled');self.assertEqual(len(self.calls),2)
        self.responses.append({'device_code':'code','user_code':'ABCD','verification_url':'https://evil.example/device','expires_in':60})
        with self.assertRaises(ProviderError):self.service.start()

class HTTPTests(unittest.TestCase):
    def test_configuration_never_served_or_echoed(self):
        import urllib.request
        import urllib.error
        from http.server import ThreadingHTTPServer
        from server.server import Handler,ROOT
        with tempfile.TemporaryDirectory(dir=ROOT/'server') as directory:
            path=Path(directory)/'google-device.json';server=ThreadingHTTPServer(('127.0.0.1',0),lambda *a,**kw:Handler(*a,directory=str(ROOT),**kw));server.google_device=DeviceLogin(path);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}';client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            def post(value,origin=None):
                req=urllib.request.Request(base+'/api/google/device',data=json.dumps(value).encode(),headers={'Content-Type':'application/json','X-Architex-Request':'1','Origin':origin or base})
                try:return client.open(req,timeout=5)
                except urllib.error.HTTPError as error:return error
            try:
                response=post({'op':'configure','clientId':'device.apps.googleusercontent.com','clientSecret':'never-echo-this'});self.assertEqual(response.status,200);self.assertEqual(response.headers['Cache-Control'],'no-store');self.assertNotIn('never-echo-this',response.read().decode())
                self.assertEqual(post({'op':'status'},'https://evil.example').code,403)
                with self.assertRaises(urllib.error.HTTPError) as error:client.open(base+'/'+str(path.relative_to(ROOT)),timeout=5)
                self.assertEqual(error.exception.code,404)
            finally:server.shutdown();thread.join();server.server_close()
