import tempfile
import unittest
from pathlib import Path
from server.agent_runtime import Runtime
class HistoryTests(unittest.TestCase):
    def test_history_filters_counts_and_persistence(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'proof.txt').write_text('proof');runtime=Runtime(root,[])
            try:
                first=runtime.start({'goal':'Inspect architecture','tool':'codeiX'})
                runtime.dispatch({'op':'tool','session':first['id'],'tool':'read_file','args':{'path':'missing.txt'},'callId':'failure'})
                runtime.dispatch({'op':'finish','session':first['id'],'outcome':'partial','summary':'Missing proof target'})
                second=runtime.start({'goal':'Write document','tool':'textiX'})
                runtime.dispatch({'op':'cancel','session':second['id']})
                page=runtime.dispatch({'op':'run_history','tool':'codeiX','limit':1})
                self.assertEqual(page['total'],1);self.assertTrue(page['done']);self.assertEqual(page['runs'][0]['failures'],1);self.assertEqual(page['runs'][0]['toolCalls'],1);self.assertEqual(page['runs'][0]['outcome'],'partial')
                self.assertEqual(runtime.dispatch({'op':'run_history','query':'MISSING PROOF'})['total'],1)
                self.assertEqual(runtime.dispatch({'op':'run_history','status':'paused'})['runs'][0]['id'],second['id'])
                self.assertEqual(runtime.dispatch({'op':'run_history','outcome':'complete'})['total'],0)
                page=runtime.dispatch({'op':'run_history','limit':1});next_page=runtime.dispatch({'op':'run_history','limit':1,'cursor':page['nextCursor']});self.assertNotEqual(page['runs'][0]['id'],next_page['runs'][0]['id']);self.assertTrue(next_page['done'])
                with self.assertRaises(ValueError):runtime.dispatch({'op':'run_history','limit':0})
                before=len(runtime.get(first['id'])['events']);runtime.dispatch({'op':'run_history'});self.assertEqual(before,len(runtime.get(first['id'])['events']))
            finally:runtime.close()
            runtime=Runtime(root,[])
            try:self.assertEqual(runtime.dispatch({'op':'run_history','query':'architecture'})['runs'][0]['summary'],'Missing proof target')
            finally:runtime.close()
