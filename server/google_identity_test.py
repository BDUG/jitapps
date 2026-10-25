"""Google's verifier with generated RSA credentials and mocked public cert retrieval."""
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from server import google_identity

try:
    from google.auth import jwt
    from google.auth.crypt import RSASigner
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    AVAILABLE=True
except ImportError:AVAILABLE=False

@unittest.skipUnless(AVAILABLE,'Install requirements-google.txt and cryptography to exercise signed test credentials')
class GoogleIdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        cls.signer=RSASigner.from_string(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()),key_id='test-key')
        public=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        cls.cert_response=type('Response',(),{'status':200,'data':json.dumps({'test-key':public}).encode()})()
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.config=Path(self.folder.name)/'config.json';self.config.write_text('{"clientId":"test.apps.googleusercontent.com"}');google_identity._cert_cache.clear()
        self.transport=patch('google.auth.transport.requests.Request').start();self.transport.return_value.return_value=self.cert_response
        self.claims={'iss':'https://accounts.google.com','aud':'test.apps.googleusercontent.com','sub':'12345','email':'person@example.com','email_verified':True,'name':'Test person','nonce':'nonce_with_more_than_twenty_chars','iat':int(time.time()),'exp':int(time.time())+3600}
    def tearDown(self):patch.stopall();self.folder.cleanup()
    def request(self,**changes):
        claims={**self.claims,**changes};token=jwt.encode(self.signer,claims).decode();return {'credential':token,'clientId':self.claims['aud'],'nonce':self.claims['nonce']}
    def test_signature_claims_and_public_cert_cache(self):
        request=self.request();result=google_identity.verify(request,self.config);self.assertTrue(result['verified']);self.assertEqual(result['email'],'person@example.com');self.assertNotIn('credential',result)
        google_identity.verify(request,self.config);self.assertEqual(self.transport.return_value.call_count,1);self.assertEqual(self.transport.return_value.call_args.args[0],'https://www.googleapis.com/oauth2/v1/certs')
    def test_rejects_untrusted_claims_and_tampering(self):
        for changes in [{'aud':'wrong.apps.googleusercontent.com'},{'iss':'https://evil.example'},{'nonce':'wrong_nonce'},{'exp':int(time.time())-100},{'iat':int(time.time())+600},{'email_verified':False},{'sub':''}]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):google_identity.verify(self.request(**changes),self.config)
        request=self.request();parts=request['credential'].split('.');parts[-1]='AAAA';request['credential']='.'.join(parts)
        with self.assertRaises(ValueError):google_identity.verify(request,self.config)
    def test_rejects_config_mismatch_and_malformed_input(self):
        request=self.request();request['clientId']='other.apps.googleusercontent.com'
        with self.assertRaises(ValueError):google_identity.verify(request,self.config)
        for value in [[],{}, {'credential':'a'*16001,'clientId':self.claims['aud'],'nonce':self.claims['nonce']}]:
            with self.assertRaises(ValueError):google_identity.verify(value,self.config)

class IdentityHTTPTests(unittest.TestCase):
    def test_same_origin_json_and_unavailable_dependency(self):
        import threading
        import urllib.request
        import urllib.error
        from http.server import ThreadingHTTPServer
        from server.server import Handler,ROOT
        server=ThreadingHTTPServer(('127.0.0.1',0),lambda *a,**kw:Handler(*a,directory=str(ROOT),**kw));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}';client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def call(headers=None):
            request=urllib.request.Request(base+'/api/google/verify',data=b'{}',headers={'Content-Type':'application/json','Origin':base,'X-Architex-Request':'1',**(headers or {})})
            try:return client.open(request,timeout=5)
            except urllib.error.HTTPError as error:return error
        try:
            with patch.object(google_identity,'verify',return_value={'verified':True,'email':'test@example.com'}) as verify:
                response=call();self.assertEqual(response.status,200);self.assertEqual(response.headers['Cache-Control'],'no-store');self.assertTrue(json.load(response)['verified']);verify.assert_called_once()
                for headers in [{'Origin':'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'X-Architex-Request':'no'}]:self.assertEqual(call(headers).code,403)
                self.assertEqual(call({'Content-Type':'text/plain'}).code,415)
            with patch.object(google_identity,'verify',side_effect=google_identity.Unavailable('Install optional verifier')):self.assertEqual(call().code,503)
        finally:server.shutdown();thread.join();server.server_close()
