"""Provider failures must remain actionable without exposing upstream secrets."""
import io
import json
import pathlib
import socket
import ssl
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from server import relay, relay_config

class ProviderErrors(unittest.TestCase):
    def test_response_adapters(self):
        cases = [
            ('openai', {'choices':[{'finish_reason':'length','message':{'content':'partial JSON'}}]}, 'provider_output_limit'),
            ('openai', {'choices':[{'message':{'content':None,'refusal':'private refusal body'}}]}, 'provider_blocked'),
            ('openai', {'choices':[]}, 'provider_empty_response'),
            ('openai', {'error':{'message':'secret upstream body'}}, 'provider_error'),
            ('gemini', {'candidates':[]}, 'provider_empty_response'),
            ('gemini', {'promptFeedback':{'blockReason':'SAFETY'}}, 'provider_blocked'),
            ('gemini', {'candidates':[{'finishReason':'MAX_TOKENS'}]}, 'provider_output_limit'),
            ('edenai', {'openai':{'status':'fail','error':'secret upstream body'}}, 'provider_error'),
        ]
        for provider, data, code in cases:
            with self.subTest(provider=provider,data=data):
                profile=relay_config.preset(provider)
                if provider=='edenai':profile['protocol']='eden-v2'
                with self.assertRaises(relay_config.ProviderResponseError) as error:
                    relay_config.response_text(profile,data)
                self.assertEqual(error.exception.code,code)
                self.assertNotIn('secret upstream body',str(error.exception))
        self.assertEqual(relay_config.response_text(relay_config.preset('gemini'),{'candidates':[{'content':{'parts':[{'text':'hidden','thought':True},{'text':'answer'}]}}]}),'answer')
        self.assertEqual(relay_config.response_text(relay_config.preset('openai'),{'choices':[{'message':{'content':[{'type':'text','text':'answer'}]}}]}),'answer')

    def test_http_failure_diagnostics(self):
        class Quiet(relay.Handler):
            def log_message(self,*args):pass
        with tempfile.TemporaryDirectory() as directory:
            http=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
            http.allowed_origins=set()
            http.store=relay_config.Store(pathlib.Path(directory)/'providers.json')
            profile=relay_config.preset('openai');profile['apiKey']='secret-test-key'
            http.store.save(dict(format='architex-relay-providers',version=1,profiles=[profile],activeProfileId='openai',allowedOrigins=[]))
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            # Capture the real client opener before patching the relay's transport.
            client=urllib.request.build_opener()
            with client.open(f'http://127.0.0.1:{http.server_port}/api/health') as response:
                health=json.load(response)
            self.assertEqual(health['providerDiagnosticsVersion'],1)
            self.assertTrue(health['providerConfigured'])
            self.assertNotIn('secret-test-key',json.dumps(health))
            class FakeOpener:
                result=None
                def open(self,*args,**kwargs):
                    if isinstance(self.result,Exception):raise self.result
                    return io.BytesIO(self.result)
            fake=FakeOpener()
            failures=[
                (urllib.error.URLError(OSError('Tunnel connection failed: 403 Forbidden secret-test-key')), 'provider_proxy_denied'),
                (urllib.error.URLError(ssl.SSLCertVerificationError('secret-test-key')), 'provider_tls_error'),
                (urllib.error.URLError(socket.gaierror('secret-test-key')), 'provider_dns_error'),
                (TimeoutError('secret-test-key'), 'provider_timeout'),
                (ConnectionRefusedError('secret-test-key'), 'provider_connection_refused'),
                (urllib.error.HTTPError('https://example.org',401,'secret-test-key',{},None), 'provider_http_error'),
                (b'<html>secret-test-key</html>', 'provider_invalid_json'),
                (b'{"choices":[]}', 'provider_empty_response'),
                (b'{"choices":[{"finish_reason":"length","message":{"content":"partial"}}]}','provider_output_limit'),
                (b'{"choices":[{"message":{"content":"working answer"}}]}',None),
            ]
            try:
                with patch.object(relay.urllib.request,'build_opener',return_value=fake):
                    for result,code in failures:
                        with self.subTest(code=code):
                            fake.result=result
                            req=urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/chat',data=json.dumps({'messages':[{'role':'user','content':'Generate an app'}]}).encode(),headers={'Content-Type':'application/json','X-Architex-Request':'1'})
                            try:
                                with client.open(req,timeout=4) as response:status=response.status;data=json.load(response)
                            except urllib.error.HTTPError as error:status=error.code;data=json.load(error)
                            self.assertNotIn('secret-test-key',json.dumps(data))
                            if code:self.assertEqual(status,502);self.assertEqual(data['code'],code)
                            else:self.assertEqual(status,200);self.assertEqual(data['text'],'working answer')
            finally:http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
