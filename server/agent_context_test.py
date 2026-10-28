import json
import os
from unittest import mock
from codingagentlib.python import agent_context
from pathlib import Path
import tempfile
import unittest
import zipfile
from server.agent_runtime import Runtime

class ContextTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.runtime=Runtime(self.root,[]);self.sid=self.runtime.start({'goal':'compressed context','allowEdits':False})['id']
    def tearDown(self):self.runtime.close();self.tmp.cleanup()
    def call(self,op,**data):return self.runtime.dispatch({'op':op,'session':self.sid,**data})
    def archive(self,value):
        text=json.dumps(value,ensure_ascii=False);upload=self.call('context_begin')['upload'];offset=0
        for start in range(0,len(text),17000):offset=self.call('context_chunk',upload=upload,offset=offset,text=text[start:start+17000])['offset']
        return self.call('context_commit',upload=upload,bytes=offset)
    def tool(self,name,**args):return self.call('tool',tool=name,args=args,callId='call'+str(len(self.runtime.get(self.sid)['events'])))
    def test_chunked_unicode_archive_paging_restart_and_snapshot_isolation(self):
        original='private unsaved 🧪\n'*20000;first=self.archive({'project':{'files':[{'path':'unsaved.js','content':original}]}});second=self.archive({'project':'new version'})
        self.assertNotEqual(first['snapshot'],second['snapshot']);text='';offset=0
        while True:
            page=self.tool('read_context',snapshot=first['snapshot'],path='/project/files/0/content',offset=offset,limit=12345)['result'];text+=page['text'];offset=page['nextOffset']
            if page['done']:break
        self.assertEqual(text,original)
        self.runtime.close();self.runtime=Runtime(self.root,[]);self.call('resume')
        self.assertIn('new version',self.tool('read_context')['result']['text'])
        other=self.runtime.start({'goal':'other session'})
        missing=self.runtime.dispatch({'op':'tool','session':other['id'],'tool':'read_context','args':{'snapshot':first['snapshot']},'callId':'private'})
        self.assertFalse(missing['ok'])
        with zipfile.ZipFile(self.runtime.package(self.runtime.get(self.sid))) as z:
            self.assertEqual(json.loads(z.read('context/'+first['snapshot']+'.json'))['project']['files'][0]['content'],original)
            self.assertFalse(any(n.endswith('.tmp') for n in z.namelist()))
    def test_missing_snapshot_reports_recovery_and_exact_reupload_restores_it(self):
        source={'project':{'files':[{'path':'draft.js','content':'unsaved original'}]}}
        saved=self.archive(source);digest=saved['snapshot']
        path=self.root/'.suite-agent'/'sessions'/self.sid/'contexts'/(digest+'.json')
        path.unlink()
        missing=self.tool('read_context',snapshot=digest)
        self.assertFalse(missing['ok']);self.assertEqual(missing['code'],'context_snapshot_missing')
        self.assertEqual(missing['snapshot'],digest)
        self.assertNotIn(str(self.root),missing['error']);self.assertIn('read_current_project',missing['error'])
        other=self.archive({'project':'newer content'})
        self.assertNotEqual(other['snapshot'],digest)
        self.assertEqual(self.tool('read_context',snapshot=digest)['code'],'context_snapshot_missing')
        restored=self.archive(source);self.assertEqual(restored['snapshot'],digest)
        self.assertIn('unsaved original',self.tool('read_context',snapshot=digest)['result']['text'])

    def test_verified_pages_reuse_parsing_and_rendering(self):
        value={'items':['Unicode 🧪']*2000};saved=self.archive(value);session=self.runtime.get(self.sid)
        self.runtime._context_cache=None
        expected=json.dumps(value,ensure_ascii=False,indent=2)
        with mock.patch.object(agent_context.json,'loads',wraps=json.loads) as loads, mock.patch.object(agent_context.json,'dumps',wraps=json.dumps) as dumps:
            pages=[agent_context.read(self.runtime,session,{'snapshot':saved['snapshot'],'offset':offset,'limit':1000})['text'] for offset in range(0,len(expected),1000)]
            self.assertEqual(''.join(pages),expected);self.assertEqual(loads.call_count,1);self.assertEqual(dumps.call_count,1)
        path=session['_dir']/'contexts'/(saved['snapshot']+'.json');stamp=path.stat();raw=path.read_bytes()
        path.write_bytes(raw.replace(b'Unicode',b'Changed'));os.utime(path,ns=(stamp.st_atime_ns,stamp.st_mtime_ns))
        with self.assertRaisesRegex(ValueError,'changed'):agent_context.read(self.runtime,session,{'snapshot':saved['snapshot']})
        path.unlink()
        with self.assertRaises(agent_context.SnapshotMissing):agent_context.read(self.runtime,session,{'snapshot':saved['snapshot']})

    def test_read_returns_only_the_bytes_it_verified(self):
        saved=self.archive({'source':'verified original'});session=self.runtime.get(self.sid)
        path=session['_dir']/'contexts'/(saved['snapshot']+'.json');original=path.read_bytes()
        self.runtime._context_cache=None
        read_bytes=Path.read_bytes
        def replace_after_read(target):
            raw=read_bytes(target)
            if target==path:target.write_bytes(original.replace(b'verified original',b'unverified change'))
            return raw
        with mock.patch.object(Path,'read_bytes',replace_after_read):
            result=agent_context.read(self.runtime,session,{'snapshot':saved['snapshot'],'path':'/source'})
        self.assertEqual(result['text'],'verified original')
        with self.assertRaisesRegex(ValueError,'changed'):agent_context.read(self.runtime,session,{'snapshot':saved['snapshot']})

    def test_cache_limits_and_session_isolation(self):
        saved=self.archive({'items':['large text']*100});session=self.runtime.get(self.sid)
        self.runtime._context_cache=None
        with mock.patch.object(agent_context,'CACHE_BYTES',100):
            first=agent_context.read(self.runtime,session,{'snapshot':saved['snapshot']})
            self.assertIsNone(self.runtime._context_cache)
            self.assertEqual(first,agent_context.read(self.runtime,session,{'snapshot':saved['snapshot']}))
        agent_context.read(self.runtime,session,{'snapshot':saved['snapshot']})
        other=self.runtime.get(self.runtime.start({'goal':'isolated'})['id'])
        with self.assertRaises(agent_context.SnapshotMissing):agent_context.read(self.runtime,other,{'snapshot':saved['snapshot']})
        value={str(i):['🧪']*10 for i in range(10)};rendered={}
        with mock.patch.object(agent_context,'CACHE_BYTES',200):
            for i in range(10):
                self.assertEqual(agent_context.page(value,'/'+str(i),{},rendered),agent_context.page(value,'/'+str(i),{}))
                self.assertLessEqual(len(rendered),agent_context.RENDERED_PATHS);self.assertLessEqual(sum(map(len,rendered.values())),200)
        self.runtime.close();self.assertIsNone(self.runtime._context_cache)

    def test_original_history_and_exact_pointer_are_retrievable(self):
        event=self.runtime.event(self.runtime.get(self.sid),'assistant',{'plan':'original '*3000,'special/key':'exact 🧪'})
        page=self.tool('read_history',index=event['index'],path='/value/plan',offset=0,limit=100)['result'];self.assertEqual(page['text'],('original '*3000)[:100]);self.assertFalse(page['done'])
        exact=self.tool('read_history',index=event['index'],path='/value/special~1key')['result'];self.assertEqual(exact['text'],'exact 🧪')
        listed=self.tool('read_history',cursor=0,limit=1)['result'];self.assertEqual(listed['events'][0]['index'],event['index']);self.assertNotIn('value',listed['events'][0])
    def test_bad_offsets_json_symlinks_and_snapshot_mutation(self):
        upload=self.call('context_begin')['upload'];self.call('context_chunk',upload=upload,offset=0,text='{}')
        with self.assertRaises(ValueError):self.call('context_chunk',upload=upload,offset=0,text='{}')
        with self.assertRaises(ValueError):self.call('context_commit',upload=upload,bytes=1)
        self.call('context_abort',upload=upload)
        with self.assertRaises(ValueError):self.call('context_abort',upload='../escape')
        upload=self.call('context_begin')['upload'];self.call('context_chunk',upload=upload,offset=0,text='{"value":NaN}')
        with self.assertRaises(ValueError):self.call('context_commit',upload=upload,bytes=13)
        self.call('context_abort',upload=upload)
        saved=self.archive({'source':'unchanged'});path=self.root/'.suite-agent'/'sessions'/self.sid/'contexts'/(saved['snapshot']+'.json');path.write_text('{}')
        self.assertFalse(self.tool('read_context',snapshot=saved['snapshot'])['ok'])
        path.unlink();path.symlink_to(self.root/'outside')
        self.assertFalse(self.tool('read_context',snapshot=saved['snapshot'])['ok'])

if __name__=='__main__':unittest.main()
