import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from server import relay,relay_config as C

class HandoffConfiguration(unittest.TestCase):
    def configuration(self):
        primary=C.preset('openai');primary.update(id='strong',apiKey='private-strong',model='strong-model')
        cheap=C.preset('openai');cheap.update(id='cheap',apiKey='private-cheap',model='cheap-model',inputModalities=['text','image'])
        return dict(format='architex-relay-providers',version=1,activeProfileId='strong',profiles=[primary,cheap],allowedOrigins=[],agentHandoff={'mode':'auto','primaryProfileId':'strong','continuationProfileId':'cheap','detectorProfileId':''})
    def test_legacy_profiles_and_role_validation(self):
        config=self.configuration();normalized=C.normalize(config);self.assertEqual(normalized['agentHandoff']['mode'],'auto')
        for key in ['primaryProfileId','continuationProfileId','detectorProfileId']:
            wrong=self.configuration();wrong['agentHandoff'][key]='unknown'
            with self.assertRaises(ValueError):C.normalize(wrong)
        wrong=self.configuration();wrong['agentHandoff']['continuationProfileId']='strong'
        with self.assertRaises(ValueError):C.normalize(wrong)
        del config['agentHandoff'];self.assertEqual(C.normalize(config)['agentHandoff']['mode'],'shadow')
    def test_policy_roundtrip_does_not_expose_secrets_and_detects_model_changes(self):
        with tempfile.TemporaryDirectory() as root:
            store=C.Store(Path(root)/'providers.json');store.save(self.configuration());before=store.handoff();self.assertEqual(before['continuation']['modalities'],['image','text']);self.assertNotIn('private-',json.dumps(before));self.assertNotIn('private-',json.dumps(store.snapshot()))
            config=store.snapshot(secrets=True);config['profiles'][1]['model']='new-model';store.save(config);self.assertNotEqual(store.handoff()['continuation']['id'],before['continuation']['id'])
            restored=C.Store(Path(root)/'providers.json');self.assertEqual(restored.handoff(),store.handoff())
    def test_explicit_profile_selection_and_revision_are_enforced_over_http(self):
        class Quiet(relay.Handler):
            def log_message(self,*args):pass
        with tempfile.TemporaryDirectory() as root:
            http=ThreadingHTTPServer(('127.0.0.1',0),Quiet);http.allowed_origins=set();http.store=C.Store(Path(root)/'providers.json');http.store.save(self.configuration());thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start();client=urllib.request.build_opener();captured=[]
            class Transport:
                def open(self,request,**kwargs):
                    captured.append((dict(request.header_items()),json.loads(request.data)));return io.BytesIO(b'{"choices":[{"message":{"content":"answer"}}]}')
            def send(body):
                req=urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/chat',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Architex-Request':'1'})
                return client.open(req)
            try:
                with patch.object(relay.urllib.request,'build_opener',return_value=Transport()):
                    with send({'profileId':'cheap','profileRevision':http.store.handoff()['continuation']['id'],'messages':[{'role':'user','content':'inspect'}]}) as response:self.assertEqual(json.load(response)['text'],'answer')
                    self.assertEqual(captured[0][1]['model'],'cheap-model');self.assertIn('Bearer private-cheap',str(captured[0][0]))
                    for extra in [{'profileId':'missing'},{'profileId':'cheap','profileRevision':'stale'}]:
                        with self.assertRaises(urllib.error.HTTPError) as caught:send({'messages':[{'role':'user','content':'inspect'}],**extra})
                        self.assertEqual(caught.exception.code,400)
                    self.assertEqual(len(captured),1)
            finally:http.shutdown();http.server_close();thread.join()
