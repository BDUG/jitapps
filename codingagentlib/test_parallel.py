import tempfile
import threading
import unittest
from pathlib import Path
from codingagentlib import Runtime

class ParallelReadTests(unittest.TestCase):
    def setup_runtime(self,folder):
        Path(folder,'a.txt').write_text('alpha\n')
        Path(folder,'b.txt').write_text('beta\n')
        runtime=Runtime(folder)
        session=runtime.dispatch({'op':'start','tool':'headless','goal':'Inspect','allowEdits':False,'allowCommands':False})
        return runtime,session['id']

    def test_concurrent_audited_reads_and_stable_order(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime,sid=self.setup_runtime(folder)
            original=runtime.execute
            barrier=threading.Barrier(2)
            def execute(s,name,args):
                if name=='read_file':barrier.wait(timeout=5)
                return original(s,name,args)
            runtime.execute=execute
            response=runtime.dispatch({'op':'tool','session':sid,'tool':'parallel_read','callId':'batch1','args':{'workers':2,'requests':[{'id':'first','tool':'read_file','args':{'path':'a.txt'}},{'id':'second','tool':'read_file','args':{'path':'b.txt'}}]}})
            self.assertTrue(response['ok'])
            results=response['result']['results']
            self.assertEqual([r['id'] for r in results],['first','second'])
            self.assertEqual([r['result']['text'] for r in results],['alpha\n','beta\n'])
            saved=runtime.dispatch({'op':'session','session':sid})
            children=[e for e in saved['events'] if e['kind']=='observation' and e['value'].get('parentCallId')=='batch1']
            self.assertEqual(len(children),2)
            self.assertEqual({e['value']['id'] for e in children},{r['callId'] for r in results})
            self.assertTrue(all(r['started'] for r in results))

    def test_preflight_restrictions_and_partial_errors(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime,sid=self.setup_runtime(folder)
            response=runtime.dispatch({'op':'tool','session':sid,'tool':'parallel_read','callId':'bad','args':{'requests':[{'id':'read','tool':'read_file','args':{'path':'a.txt'}},{'id':'write','tool':'write_file','args':{'path':'new.txt','content':'bad'}}]}})
            self.assertFalse(response['ok'])
            self.assertFalse(Path(folder,'new.txt').exists())
            self.assertEqual(sum(e['kind']=='action' for e in runtime.dispatch({'op':'session','session':sid})['events']),1)
            response=runtime.dispatch({'op':'tool','session':sid,'tool':'parallel_read','callId':'partial','args':{'requests':[{'id':'good','tool':'read_file','args':{'path':'a.txt'}},{'id':'missing','tool':'read_file','args':{'path':'absent'}}]}})
            self.assertFalse(response['ok'])
            self.assertTrue(response['result']['results'][0]['ok'])
            self.assertFalse(response['result']['results'][1]['ok'])
            self.assertEqual(Path(folder,'a.txt').read_text(),'alpha\n')

    def test_cancelled_queued_read_does_not_start(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime,sid=self.setup_runtime(folder)
            original=runtime.execute
            def execute(s,name,args):
                value=original(s,name,args)
                if name=='read_file':runtime.cancel(s)
                return value
            runtime.execute=execute
            response=runtime.dispatch({'op':'tool','session':sid,'tool':'parallel_read','callId':'cancelled','args':{'workers':1,'requests':[{'id':'first','tool':'read_file','args':{'path':'a.txt'}},{'id':'second','tool':'read_file','args':{'path':'b.txt'}}]}})
            self.assertFalse(response['ok'])
            self.assertTrue(response['result']['cancelled'])
            self.assertTrue(response['result']['results'][0]['started'])
            self.assertFalse(response['result']['results'][1]['started'])
            self.assertIsNone(response['result']['results'][1]['callId'])
if __name__=='__main__':unittest.main()
