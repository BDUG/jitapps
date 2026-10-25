import base64
import io
import json
import pathlib
import tempfile
import threading
import unittest
import wave
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from server import multimodal as M, relay_config as C, relay

B64=base64.b64encode(b'example binary\x00\xff').decode()
IMAGE='data:image/png;base64,'+B64
PDF='data:application/pdf;base64,'+base64.b64encode(b'%PDF-1.4\n').decode()
def profile(provider='openai'):
    p=C.preset(provider);p['apiKey']='test-private-key';return p

def messages():return [{'role':'system','content':'Return JSON with reviewed edits.'},{'role':'user','content':[{'type':'text','text':'Inspect these references.'},{'type':'image_url','image_url':{'url':IMAGE}},{'type':'input_audio','input_audio':{'data':B64,'format':'wav'}},{'type':'file','file':{'filename':'brief.pdf','file_data':PDF}}]}]

class MultimodalTests(unittest.TestCase):
    def test_native_requests(self):
        for provider in ['openai','litellm','edenai','openrouter']:
            body=C.build(profile(provider),messages(),['text','image'])['body'];self.assertEqual(body['messages'],messages());self.assertEqual(body['modalities'],['text','image'])
        body=C.build(profile('gemini'),messages(),['text','image'])['body'];parts=body['contents'][0]['parts'];self.assertEqual(parts[1]['inlineData'],{'mimeType':'image/png','data':B64});self.assertEqual(parts[2]['inlineData']['mimeType'],'audio/wav');self.assertEqual(parts[3]['inlineData']['mimeType'],'application/pdf');self.assertEqual(body['generationConfig']['responseModalities'],['TEXT','IMAGE'])
        self.assertEqual(C.build(profile('gemini'),messages(),['text','audio'])['body']['generationConfig']['responseModalities'],['AUDIO'])
        self.assertEqual(C.build(profile(),messages(),['text','audio'])['body']['audio'],{'voice':'alloy','format':'wav'})
        self.assertNotIn('modalities',C.build(profile(),[{'role':'user','content':'Hello'}],['text'])['body'])
    def test_input_rejections(self):
        bad=[{'type':'image_url','image_url':{'url':'https://example.com/image.png'}},{'type':'image_url','image_url':{'url':'data:image/svg+xml;base64,'+B64}},{'type':'image_url','image_url':{'url':'data:image/png;base64,broken'}},{'type':'input_audio','input_audio':{'format':'exe','data':B64}},{'type':'file','file':{'filename':'file.html','file_data':'data:text/html;base64,'+B64}},{'type':'video_url','url':'file:///etc/passwd'}]
        for part in bad:
            with self.subTest(part=part),self.assertRaises(ValueError):C.build(profile(),[{'role':'user','content':[part]}])
        with self.assertRaises(ValueError):C.build(profile(),[{'role':'system','content':[{'type':'text','text':'instructions'}]}])
        legacy=profile('edenai');legacy['protocol']='eden-v2'
        with self.assertRaisesRegex(ValueError,'Eden v2'):C.build(legacy,messages())
        with self.assertRaises(ValueError):C.build(profile(),messages(),['video'])
    def test_outputs_and_no_remote_fetch(self):
        payload={'choices':[{'message':{'content':[{'type':'text','text':'Artwork ready.'}], 'images':[{'type':'image_url','image_url':{'url':IMAGE}}],'audio':{'data':B64,'format':'wav','transcript':'Spoken summary'}}}]}
        result=C.response_content(profile(),payload);self.assertEqual(result['text'],'Artwork ready.');self.assertEqual([x['kind'] for x in result['media']],['image','audio']);self.assertEqual(result['media'][0]['dataUrl'],IMAGE)
        payload['choices'][0]['finish_reason']='length';partial=C.response_content(profile(),payload);self.assertTrue(partial['incomplete']);self.assertEqual(partial['text'],'');self.assertEqual(partial['partialText'],'Artwork ready.');self.assertEqual(partial['media'][0]['dataUrl'],IMAGE)
        gemini={'candidates':[{'content':{'parts':[{'text':'private thought','thought':True},{'inlineData':{'mimeType':'image/png','data':B64}},{'inlineData':{'mimeType':'application/pdf','data':base64.b64encode(b'%PDF').decode()}}]}}]};result=C.response_content(profile('gemini'),gemini);self.assertEqual(result['text'],'');self.assertEqual([x['kind'] for x in result['media']],['image','file'])
        with patch('urllib.request.urlopen',side_effect=AssertionError('No provider media fetch')):self.assertEqual(M.media_item({'mimeType':'image/png','url':'https://example.com/result.png'})['url'],'https://example.com/result.png')
        for url in ['javascript:alert(1)','file:///etc/passwd','http://localhost/private','https://key:secret@example.com/image']:
            with self.assertRaises(ValueError):M.media_item({'mimeType':'image/png','url':url})
        with self.assertRaises(C.ProviderResponseError):C.response_content(profile(),{'choices':[{'message':{'images':[{'image_url':{'url':'data:image/png;base64,broken'}}]}}]})
        with self.assertRaises(C.ProviderResponseError):C.response_content(profile(),{'choices':[{'finish_reason':'content_filter','message':{'images':[{'image_url':{'url':IMAGE}}]}}]})
        with self.assertRaises(C.ProviderResponseError):C.response_content(profile(),{'choices':[]})
        for bad in [{'choices':{'not':'a list'}},{'choices':[{'message':'bad'}]},{'choices':[{'finish_reason':'length','message':{'refusal':'blocked','images':[{'image_url':{'url':IMAGE}}]}}]}]:
            with self.assertRaises(C.ProviderResponseError):C.response_content(profile(),bad)
    def test_native_pcm_audio(self):
        raw=b'\x00\x00\x01\x00'
        result=C.response_content(profile('gemini'),{'candidates':[{'content':{'parts':[{'inlineData':{'mimeType':'audio/L16;codec=pcm;rate=24000','data':base64.b64encode(raw).decode()}}]}}]})
        media=result['media'][0];self.assertEqual(media['mimeType'],'audio/wav')
        with wave.open(io.BytesIO(base64.b64decode(media['dataUrl'].split(',')[1])),'rb') as audio:
            self.assertEqual(audio.getframerate(),24000);self.assertEqual(audio.getnchannels(),1);self.assertEqual(audio.readframes(2),raw)
        with self.assertRaises(ValueError):M.playable('audio/L16;rate=0',B64)

    def test_relay_round_trip(self):
        class Quiet(relay.Handler):
            def log_message(self,*a):pass
        with tempfile.TemporaryDirectory() as folder:
            http=ThreadingHTTPServer(('127.0.0.1',0),Quiet);http.allowed_origins=set();http.store=C.Store(pathlib.Path(folder)/'providers.json');p=profile();http.store.save(dict(format='architex-relay-providers',version=1,profiles=[p],activeProfileId=p['id'],allowedOrigins=[]));thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start();client=urllib.request.build_opener();captured=[]
            class Fake:
                def open(self,request,**kwargs):
                    captured.append(json.loads(request.data));return io.BytesIO(json.dumps({'choices':[{'message':{'content':'Artwork response','images':[{'image_url':{'url':IMAGE}}]}}]}).encode())
            try:
                with patch.object(relay.urllib.request,'build_opener',return_value=Fake()):
                    req=urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/chat',data=json.dumps({'messages':messages(),'modalities':['text','image']}).encode(),headers={'Content-Type':'application/json','X-Architex-Request':'1'})
                    with client.open(req,timeout=5) as response:result=json.load(response)
                self.assertEqual(captured[0]['messages'][1]['content'][1]['image_url']['url'],IMAGE);self.assertEqual(result['media'][0]['dataUrl'],IMAGE);self.assertNotIn('test-private-key',json.dumps(result))
            finally:http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
