"""Relay-owned configuration, protocol, security and HTTP integration tests."""
import sys
sys.dont_write_bytecode=True
import importlib.util,json,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
spec=importlib.util.spec_from_file_location('architex_server',Path(__file__).with_name('server.py'));relay=importlib.util.module_from_spec(spec);spec.loader.exec_module(relay)
class Upstream(BaseHTTPRequestHandler):
    calls=[]
    def log_message(self,*args):pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));self.calls.append((self.path,self.headers.get('Authorization'),body))
        if self.path.startswith('/redirect'):
            self.send_response(302);self.send_header('Location','/v1/chat/completions');self.end_headers();return
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'choices':[{'message':{'content':('x'*(3*1024*1024) if body.get('messages',[{}])[-1].get('content')=='large-response-test' else 'Mock answer')}}]}).encode())
class QuietRelay(relay.Handler):
    def log_message(self,*args):pass
class RelayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.upstream=ThreadingHTTPServer(('127.0.0.1',0),Upstream);cls.server=ThreadingHTTPServer(('127.0.0.1',0),QuietRelay);cls.server.store=relay.relay_config.Store(Path(cls.tmp.name)/'providers.json');cls.server.allowed_origins=set()
        for server in [cls.upstream,cls.server]:threading.Thread(target=server.serve_forever,daemon=True).start()
        cls.base='http://127.0.0.1:'+str(cls.server.server_port);cls.target='http://127.0.0.1:'+str(cls.upstream.server_port)
    @classmethod
    def tearDownClass(cls):
        for server in [cls.upstream,cls.server]:server.shutdown();server.server_close()
        cls.tmp.cleanup()
    def setUp(self):
        p=relay.relay_config.preset('openai');p.update(apiKey='server-only-key',endpoint=self.target+'/v1/chat/completions');self.server.store.save(dict(format='architex-relay-providers',version=1,activeProfileId='openai',profiles=[p],allowedOrigins=[]))
    def call(self,path,data=None,origin=None,admin=False,method=None,headers=None):
        req=urllib.request.Request(self.base+path,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Origin':origin or self.base,**({'X-Architex-Admin':'1'} if admin else {'X-Architex-Request':'1'}),**({'Content-Type':'application/json'} if data is not None else {}),**(headers or {})})
        try:
            with urllib.request.urlopen(req,timeout=4) as r:return r.status,json.loads(r.read() or '{}'),r.headers
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or '{}'),e.headers
    def test_health(self):self.assertEqual(self.call('/api/health')[1]['protocolVersion'],2)
    def test_chat_only_messages(self):
        status,data,_=self.call('/api/chat',{'messages':[{'role':'user','content':'Hi'}]});self.assertEqual(status,200);self.assertEqual(data,{'text':'Mock answer'});self.assertEqual(Upstream.calls[-1][1],'Bearer server-only-key')
    def test_long_multiturn_conversation(self):
        messages=[{'role':'system','content':'Conversation'}]
        for index in range(60):
            messages.extend([{'role':'user','content':str(index)},{'role':'assistant','content':'Answer'}])
        messages.append({'role':'user','content':'Continue'})
        status,_,_=self.call('/api/chat',{'messages':messages})
        self.assertEqual(status,200)
        self.assertEqual(Upstream.calls[-1][2]['messages'],messages)
    def test_large_chat_request(self):
        content='x'*(3*1024*1024)
        status,data,_=self.call('/api/chat',{'messages':[{'role':'user','content':content}]})
        self.assertEqual(status,200)
        self.assertEqual(data,{'text':'Mock answer'})
        self.assertEqual(Upstream.calls[-1][2]['messages'][0]['content'],content)
    def test_large_chat_response(self):
        status,data,_=self.call('/api/chat',{'messages':[{'role':'user','content':'large-response-test'}]})
        self.assertEqual(status,200)
        self.assertEqual(data['text'],'x'*(3*1024*1024))
    def test_old_client_credentials_rejected(self):self.assertEqual(self.call('/api/chat',{'url':self.target,'headers':{},'body':{}})[0],400)
    def test_admin_redacted(self):
        status,data,_=self.call('/api/admin/config',admin=True);self.assertEqual(status,200);self.assertNotIn('server-only-key',json.dumps(data));self.assertTrue(data['profiles'][0]['hasApiKey'])
    def test_same_origin_admin_only(self):
        self.server.allowed_origins={'https://trusted.example'}
        try:
            status,_,headers=self.call('/api/admin/config',origin='https://trusted.example',admin=True);self.assertEqual(status,403);self.assertIsNone(headers.get('Access-Control-Allow-Origin'))
        finally:self.server.allowed_origins=set()
    def test_secret_retention_and_destination_change(self):
        data=self.server.store.snapshot();data['profiles'][0]['name']='Renamed';self.assertEqual(self.call('/api/admin/config',data,admin=True)[0],200);self.assertEqual(self.server.store.active()['apiKey'],'server-only-key');data['profiles'][0]['endpoint']=self.target+'/different/chat/completions';self.call('/api/admin/config',data,admin=True);self.assertEqual(self.server.store.active()['apiKey'],'')
    def test_exports(self):
        self.assertNotIn('server-only-key',json.dumps(self.call('/api/admin/export',{},admin=True)[1]));self.assertIn('server-only-key',json.dumps(self.call('/api/admin/export',{'includeKeys':True},admin=True)[1]))
    def test_persistence(self):
        self.assertEqual(self.server.store.path.stat().st_mode&0o777,0o600);self.assertEqual(relay.relay_config.Store(self.server.store.path).active()['apiKey'],'server-only-key')
    def test_preflight_and_cross_origin_chat(self):
        origin='https://trusted.example';self.server.allowed_origins={origin}
        try:
            status,_,headers=self.call('/api/chat',origin=origin,method='OPTIONS',headers={'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-architex-request','Access-Control-Request-Private-Network':'true'});self.assertEqual(status,204);self.assertEqual(headers['Access-Control-Allow-Origin'],origin);self.assertEqual(headers['Access-Control-Allow-Private-Network'],'true');self.assertEqual(self.call('/api/chat',{'messages':[{'role':'user','content':'Hi'}]},origin=origin,headers={'Sec-Fetch-Site':'cross-site'})[0],200)
        finally:self.server.allowed_origins=set()
    def test_untrusted_origin(self):self.assertEqual(self.call('/api/chat',{'messages':[]},origin='https://untrusted.example')[0],403)
    def test_redirect_not_followed(self):
        data=self.server.store.snapshot(True);data['profiles'][0]['endpoint']=self.target+'/redirect/chat/completions';self.server.store.save(data);before=len(Upstream.calls);status,data,_=self.call('/api/chat',{'messages':[{'role':'user','content':'Hi'}]});self.assertEqual(status,502);self.assertEqual(len(Upstream.calls),before+1);self.assertNotIn('server-only-key',json.dumps(data))
    def test_provider_protocols(self):
        messages=[{'role':'system','content':'Rules'},{'role':'user','content':'Question'}]
        for provider in relay.relay_config.TEMPLATES:
            p=relay.relay_config.preset(provider);p['apiKey']='example';request=relay.relay_config.build(p,messages);relay.validate_request(request)
        p=relay.relay_config.preset('edenai');p.update(apiKey='example',protocol='eden-v2',endpoint='https://api.edenai.run/v2/text/chat');self.assertEqual(relay.relay_config.build(p,messages)['body']['text'],'Question');self.assertEqual(relay.relay_config.response_text(p,{'openai':{'generated_text':'Answer'}}),'Answer')
    def test_versioned_gpt5_endpoint_save_and_chat(self):
        data=self.server.store.snapshot(True)
        url=self.target+'/api/openai/deployments/gpt-5-nano-2025-08-07/chat/completions?api-version=2025-04-01-preview&feature=a%2Bb'
        data['profiles'][0].update(endpoint=url,model='gpt-5-nano-2025-08-07')
        status,saved,_=self.call('/api/admin/config',data,admin=True)
        self.assertEqual(status,200)
        self.assertEqual(saved['profiles'][0]['endpoint'],url)
        self.assertNotIn('server-only-key',json.dumps(saved))
        self.assertEqual(self.call('/api/admin/test',{},admin=True)[0],200)
        path,authorization,body=Upstream.calls[-1]
        self.assertEqual(path,url.removeprefix(self.target))
        self.assertEqual(authorization,'Bearer server-only-key')
        self.assertEqual(body['max_completion_tokens'],4096)
        self.assertNotIn('max_tokens',body)
        self.assertNotIn('temperature',body)
        self.assertEqual(relay.relay_config.Store(self.server.store.path).active()['endpoint'],url)
    def test_gpt5_and_legacy_parameters(self):
        p=relay.relay_config.preset('openai');p['apiKey']='example'
        messages=[{'role':'user','content':'Hello'}]
        self.assertEqual(relay.relay_config.build(p,messages)['body']['max_tokens'],4096)
        for model in ['gpt-5-nano-2025-08-07','openai/gpt-5-mini']:
            p['model']=model
            body=relay.relay_config.build(p,messages)['body']
            self.assertIn('max_completion_tokens',body)
            self.assertNotIn('temperature',body)
        p.update(model='deployment-alias',endpoint='https://example.org/openai/deployments/gpt-5-nano/chat/completions?api-version=test')
        self.assertIn('max_completion_tokens',relay.relay_config.build(p,messages)['body'])
    def test_endpoint_guards_with_query_support(self):
        p=relay.relay_config.preset('openai');p['apiKey']='example'
        for url in ['https://user:pass@example.org/chat/completions?api-version=test','https://example.org/chat/completions#fragment','https://example.org/\\nchat/completions','https://example.org/chat /completions','http://example.org/chat/completions']:
            p['endpoint']=url.replace('\\n','\n')
            with self.assertRaises(ValueError):relay.relay_config.endpoint(p)
            with self.assertRaises(ValueError):relay.validate_request({'url':p['endpoint'],'headers':{'Content-Type':'application/json'},'body':{'messages':[]}})
    def test_optional_token_limit_all_protocols(self):
        messages=[{'role':'user','content':'Hello'}]
        for provider in relay.relay_config.TEMPLATES:
            p=relay.relay_config.preset(provider);p['apiKey']='example'
            for protocol in (['openai','eden-v2'] if provider=='edenai' else [p['protocol']]):
                p['protocol']=protocol
                for enabled in [True,False]:
                    p['tokenLimitEnabled']=enabled
                    body=relay.relay_config.build(p,messages)['body']
                    if protocol=='gemini':self.assertEqual('maxOutputTokens' in body['generationConfig'],enabled)
                    else:self.assertEqual('max_tokens' in body,enabled)
        p=relay.relay_config.preset('openai');p.update(apiKey='example',model='gpt-5-nano',tokenLimitEnabled=False)
        self.assertNotIn('max_completion_tokens',relay.relay_config.build(p,messages)['body'])
        data=self.server.store.snapshot(True);data['profiles'][0]['tokenLimitEnabled']=False
        self.assertEqual(self.call('/api/admin/config',data,admin=True)[0],200)
        self.assertFalse(relay.relay_config.Store(self.server.store.path).active()['tokenLimitEnabled'])
        self.assertFalse(self.call('/api/admin/export',{},admin=True)[1]['profiles'][0]['tokenLimitEnabled'])
        self.assertEqual(self.call('/api/admin/test',{},admin=True)[0],200)
        self.assertNotIn('max_tokens',Upstream.calls[-1][2])
        del data['profiles'][0]['tokenLimitEnabled']
        self.assertEqual(self.call('/api/admin/import',data,admin=True)[0],200)
        self.assertTrue(self.server.store.active()['tokenLimitEnabled'])
        data['profiles'][0]['tokenLimitEnabled']='false'
        self.assertEqual(self.call('/api/admin/config',data,admin=True)[0],400)
    def test_origin_configuration(self):
        for o in ['*','null','https://*.example','https://app.example/path']:
            with self.assertRaises(ValueError):relay.validate_origin(o)
if __name__=='__main__':unittest.main()
