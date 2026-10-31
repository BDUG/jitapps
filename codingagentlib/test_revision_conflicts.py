import concurrent.futures
import hashlib
import tempfile
import threading
import time
import unittest
from pathlib import Path
from codingagentlib import Runtime

class RevisionConflictTests(unittest.TestCase):
    def test_concurrent_sessions_cannot_overwrite_same_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder,'source.txt');p.write_text('original')
            runtime=Runtime(folder)
            sessions=[runtime.dispatch({'op':'start','goal':'Edit','allowEdits':True})['id'] for _ in range(4)]
            old=hashlib.sha256(b'original').hexdigest();barrier=threading.Barrier(4)
            original_write=runtime.write
            def delayed_write(path,data):
                if path==p:time.sleep(.03)  # Expose the former guard-to-write race.
                return original_write(path,data)
            runtime.write=delayed_write
            def update(pair):
                i,sid=pair;barrier.wait(timeout=5)
                return runtime.dispatch({'op':'tool','session':sid,'callId':'edit'+str(i),'tool':'write_file','args':{'path':'source.txt','content':'writer'+str(i),'expectedHash':old}})
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(update,enumerate(sessions)))
            self.assertEqual(sum(r['ok'] for r in results),1)
            winner=next(i for i,r in enumerate(results) if r['ok']);self.assertEqual(p.read_text(),'writer'+str(winner))
            for i,result in enumerate(results):
                if i==winner:continue
                self.assertEqual(result['code'],'file_revision_conflict')
                self.assertTrue(result['conflict']['requiresRead'])
                self.assertEqual(result['conflict']['expectedHash'],old)
                self.assertEqual(result['conflict']['actualHash'],hashlib.sha256(p.read_bytes()).hexdigest())
                self.assertEqual(runtime.get(sessions[i])['backups'],{})
                self.assertEqual(runtime.get(sessions[i])['events'][-1]['value']['code'],'file_revision_conflict')
            # Re-read and deliberately adapt the losing proposal, retaining recovery data.
            loser=(winner+1)%4;sid=sessions[loser]
            read=runtime.dispatch({'op':'tool','session':sid,'callId':'refresh','tool':'read_file','args':{'path':'source.txt'}})
            adapted=runtime.dispatch({'op':'tool','session':sid,'callId':'adapt','tool':'replace_text','args':{'path':'source.txt','find':read['result']['text'],'replacement':'adapted','expectedHash':read['result']['hash']}})
            self.assertTrue(adapted['ok']);self.assertEqual(p.read_text(),'adapted')
            backup=runtime.get(sid)['backups']['source.txt'];self.assertEqual((runtime.get(sid)['_dir']/'backups'/backup['id']).read_text(),'writer'+str(winner))
    def test_stale_create_and_delete_preserve_contents(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Runtime(folder);sid=runtime.dispatch({'op':'start','goal':'Edit','allowEdits':True})['id']
            p=Path(folder,'source.txt');p.write_text('external work')
            for i,tool in enumerate(['write_file','delete_file','replace_text','restore_file']):
                result=runtime.dispatch({'op':'tool','session':sid,'callId':'stale'+str(i),'tool':tool,'args':{'path':'source.txt','content':'overwrite','expectedHash':'missing','find':'external','replacement':'lost'}})
                self.assertFalse(result['ok']);self.assertEqual(result['code'],'file_revision_conflict');self.assertEqual(p.read_text(),'external work')
    def test_cancelled_queued_edit_does_not_write(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Runtime(folder);sid=runtime.dispatch({'op':'start','goal':'Edit','allowEdits':True})['id']
            entered=threading.Event();original=runtime.event
            def event(session,kind,value):
                result=original(session,kind,value)
                if kind=='action':entered.set()
                return result
            runtime.event=event
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                with runtime._file_edit_lock:
                    pending=pool.submit(runtime.dispatch,{'op':'tool','session':sid,'callId':'queued','tool':'write_file','args':{'path':'new.txt','content':'cancelled','expectedHash':'missing'}})
                    self.assertTrue(entered.wait(timeout=5));runtime.get(sid)['_cancel'].set()
                result=pending.result(timeout=5)
            self.assertFalse(result['ok']);self.assertFalse(Path(folder,'new.txt').exists());self.assertEqual(runtime.get(sid)['backups'],{})
