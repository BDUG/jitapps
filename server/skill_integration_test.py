import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from server.server import Handler, ROOT
from server import relay_config, relay
from server.skill_catalog import Catalog
from server.agent_runtime import Runtime

class IntegrationTests(unittest.TestCase):
    def test_chat_injection_agent_tools_and_private_database(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'server') as directory:
            folder=Path(directory);catalog=Catalog(folder/'skills/catalog.sqlite3',offline=True)
            http=ThreadingHTTPServer(('127.0.0.1',0),lambda *a,**kw:Handler(*a,directory=str(ROOT),**kw))
            http.skill_catalog=catalog;http.agent_runtime=Runtime(folder,[]);http.agent_runtime.shared_skills=catalog;http.allowed_origins=set();http.store=relay_config.Store(folder/'providers.json')
            profile=relay_config.preset('openai');profile['apiKey']='fake-test-key';http.store.save({'format':'architex-relay-providers','version':1,'activeProfileId':'openai','profiles':[profile],'allowedOrigins':[]},keep_keys=False)
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{http.server_port}';client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            def post(path,data):
                req=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Architex-Request':'1'})
                with client.open(req,timeout=10) as response:return json.load(response)
            class Provider:
                messages=None
                def open(self,req,**kwargs):
                    self.messages=json.loads(req.data)['messages'];return io.BytesIO(json.dumps({'choices':[{'message':{'content':'OK'}}]}).encode())
            provider=Provider()
            try:
                with patch.object(relay.urllib.request,'build_opener',return_value=provider):
                    result=post('/api/chat',{'app':'textiX','messages':[{'role':'system','content':'fixed schema'},{'role':'user','content':'Improve these paragraphs'}]})
                self.assertEqual(result['text'],'OK');self.assertEqual(provider.messages[-1]['content'],'Improve these paragraphs');context=json.loads(provider.messages[-2]['content'])['retrievedSkillContext'];self.assertEqual(context['app'],'textiX');self.assertTrue(context['skills']);self.assertIn('untrusted',context['notice'])
                with patch.object(relay.urllib.request,'build_opener',return_value=provider):
                    result=post('/api/chat',{'app':'colabriX','messages':[{'role':'system','content':'native whiteboard schema'},{'role':'user','content':'Cluster brainstorming notes into workshop frames'}]})
                self.assertEqual(result['text'],'OK');context=json.loads(provider.messages[-2]['content'])['retrievedSkillContext'];self.assertEqual(context['app'],'colabriX');self.assertTrue(context['skills'])
                session=post('/api/agent',{'op':'start','goal':'Inspect skills','tool':'architex'})['id']
                profile=catalog.profile('architex');custom='custom:integration';profile['selected'].append(custom);profile['overrides']={custom:{'name':'Workspace verification','description':'Review workspace changes','content':'# Verification\nInspect nebula changes and verify results.'}};catalog.save_profile('architex',profile)
                custom_read=post('/api/agent',{'op':'tool','session':session,'tool':'catalog_read','args':{'id':custom},'callId':'read-custom'})
                self.assertTrue(custom_read['ok']);self.assertIn('nebula',custom_read['result']['text'])
                custom_search=post('/api/agent',{'op':'tool','session':session,'tool':'catalog_search','args':{'query':'nebula'},'callId':'search-custom'})
                self.assertTrue(any(x['id']==custom for x in custom_search['result']['items']))
                found=post('/api/agent',{'op':'tool','session':session,'tool':'catalog_search','args':{'query':'domain modeling','kind':'skill'},'callId':'search-catalog'})
                self.assertTrue(found['ok']);doc=found['result']['items'][0];self.assertEqual(doc['name'],'domain-modeling')
                read=post('/api/agent',{'op':'tool','session':session,'tool':'catalog_read','args':{'id':doc['id'],'contentHash':doc['contentHash'],'limit':100},'callId':'read-catalog'});self.assertTrue(read['ok']);self.assertTrue(read['result']['text'])
                req=urllib.request.Request(base+'/'+str(catalog.path.relative_to(ROOT)))
                with self.assertRaises(urllib.error.HTTPError) as error:client.open(req)
                self.assertEqual(error.exception.code,404)
            finally:http.shutdown();thread.join();http.server_close();http.agent_runtime.close();catalog.close()

if __name__=='__main__':unittest.main()
