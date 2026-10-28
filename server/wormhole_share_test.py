import base64
import hashlib
import io
import json
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from server.wormhole_share import Sharing

class SharingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.broker=Sharing(self.temp.name);self.ident='1'*32
        with self.broker.connect() as db:db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(self.ident,'master','files',time.time()))
    def tearDown(self):self.broker.close();self.temp.cleanup()
    def item(self,raw=b'hello\x00\xff',ident='a'*32):
        return {'op':'send','session':self.ident,'id':ident,'name':'file.bin','mime':'application/octet-stream','data':base64.b64encode(raw).decode(),'digest':hashlib.sha256(raw).hexdigest()}
    def live(self):
        self.broker.live[self.ident]={'process':SimpleNamespace(poll=lambda:0),'state':'pairing','code':'','error':'','inflight':None,'ready':False,'write':threading.Lock()}
    def test_durable_outqueue_and_idempotent_ids(self):
        self.broker.dispatch(self.item());self.broker.dispatch(self.item())
        self.assertEqual(len(self.broker.status(self.ident)['queue']),1)
        restored=Sharing(self.temp.name)
        try:self.assertEqual(restored.status(self.ident)['queue'][0]['status'],'queued')
        finally:restored.close()
        with self.assertRaisesRegex(ValueError,'already used'):self.broker.dispatch(self.item(b'other'))
    def test_peer_receipt_then_application_processing(self):
        self.live();sent=[];self.broker.command=lambda ident,value:sent.append(value)
        self.broker.receive(self.ident,{'type':'hello','protocol':1,'role':'participant','kind':'files'})
        item={**self.item(),'type':'item'};self.broker.receive(self.ident,item);self.broker.receive(self.ident,item)
        self.assertEqual(len(self.broker.status(self.ident)['queue']),1)
        self.assertEqual(len(sent),2)
        self.assertEqual(base64.b64decode(self.broker.dispatch({'op':'read','session':self.ident,'id':item['id']})['data']),b'hello\x00\xff')
        self.broker.dispatch({'op':'done','session':self.ident,'id':item['id']})
        self.broker.receive(self.ident,item)
        self.assertEqual(self.broker.status(self.ident)['queue'][0]['status'],'processed')
        with self.assertRaisesRegex(ValueError,'already processed'):self.broker.dispatch({'op':'read','session':self.ident,'id':item['id']})
        with self.assertRaisesRegex(ValueError,'reused'):self.broker.receive(self.ident,{**self.item(b'changed'),'type':'item'})
    def test_acknowledgements_release_one_outgoing_item_at_a_time(self):
        self.live();sent=[];self.broker.command=lambda ident,value:sent.append(value)
        self.broker.dispatch(self.item(ident='a'*32));self.broker.dispatch(self.item(ident='b'*32))
        self.broker.receive(self.ident,{'type':'hello','protocol':1,'role':'participant','kind':'files'})
        self.assertEqual(len(sent),1);self.assertEqual(sent[0]['message']['id'],'a'*32)
        self.broker.receive(self.ident,{'type':'ack','id':'a'*32})
        self.assertEqual(len(sent),2);self.assertEqual(sent[1]['message']['id'],'b'*32)
        self.assertEqual(next(v for v in self.broker.status(self.ident)['queue'] if v['id']=='a'*32)['status'],'delivered')
    def test_role_mode_integrity_and_filename_validation(self):
        self.live()
        for hello in [{'role':'master','kind':'files'},{'role':'participant','kind':'colabrix'}]:
            with self.assertRaises(ValueError):self.broker.receive(self.ident,{'type':'hello','protocol':1,**hello})
        with self.assertRaisesRegex(ValueError,'handshake'):self.broker.receive(self.ident,{**self.item(),'type':'item'})
        for name in ['../escape','a/b','a\\b','\nfile','..']:
            with self.assertRaises(ValueError):self.broker.dispatch({**self.item(),'name':name})
        with self.assertRaisesRegex(ValueError,'checksum'):self.broker.dispatch({**self.item(),'digest':'0'*64})
        with self.assertRaises(ValueError):self.broker.dispatch({**self.item(),'data':'bad base64!'})
    def test_sharing_state_is_private_to_agent_tools(self):
        from server.agent_runtime import Runtime
        runtime=Runtime(self.temp.name,[])
        try:
            with self.assertRaises(PermissionError):runtime.path('.suite-wormhole/queues.sqlite3')
        finally:runtime.close()

    def test_quota_rejects_without_partial_enqueue(self):
        with patch('server.wormhole_share.MAX_QUEUED',10):
            self.broker.dispatch(self.item(b'123456'))
            with self.assertRaisesRegex(ValueError,'Queue full'):self.broker.dispatch(self.item(b'123456',ident='b'*32))
        self.assertEqual(len(self.broker.status(self.ident)['queue']),1)

class SharingHTTPTests(unittest.TestCase):
    def test_local_origin_and_private_storage(self):
        from http.server import ThreadingHTTPServer
        from server.server import Handler
        import urllib.request,urllib.error
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);broker=Sharing(root/'.suite-wormhole');server=ThreadingHTTPServer(('127.0.0.1',0),lambda *a,**kw:Handler(*a,directory=directory,**kw));server.wormhole_share=broker;server.store=SimpleNamespace(path=root/"providers.json")
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}';client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            def call(origin=base,header='1'):
                req=urllib.request.Request(base+'/api/wormhole',data=b'{"op":"health"}',headers={'Content-Type':'application/json','Origin':origin,'X-Architex-Request':header})
                try:return client.open(req,timeout=5)
                except urllib.error.HTTPError as error:return error
            try:
                self.assertEqual(call().status,200);self.assertEqual(call('https://evil.example').status,403);self.assertEqual(call(header='no').status,403)
                with self.assertRaises(urllib.error.HTTPError) as result:client.open(base+'/.suite-wormhole/queues.sqlite3')
                self.assertEqual(result.exception.code,404)
                (root/'alias').symlink_to(root/'.suite-wormhole',target_is_directory=True)
                with self.assertRaises(urllib.error.HTTPError) as alias:client.open(base+'/alias/queues.sqlite3')
                self.assertEqual(alias.exception.code,404)
            finally:server.shutdown();thread.join();server.server_close();broker.close()
