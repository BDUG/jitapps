import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from codingagentlib import Runtime
from codingagentlib.python import agent_verification as V

class VerificationBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.runtime=Runtime(self.root,[sys.executable]);self.addCleanup(self.temp.cleanup);self.addCleanup(self.runtime.close)
        self.session=self.runtime.dispatch({'op':'start','tool':'headless','goal':'Edit and verify','allowEdits':True,'allowCommands':True});self.sid=self.session['id'];self.serial=0
    def tool(self,name,args):
        self.serial+=1
        return self.runtime.dispatch({'op':'tool','session':self.sid,'tool':name,'args':args,'callId':'binding_'+str(self.serial)})
    def write(self,path='source.txt',content='one'):
        p=self.root/path;expected=hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else 'missing'
        return self.tool('write_file',{'path':path,'content':content,'expectedHash':expected})
    def command(self,code='pass'):
        return self.tool('run_command',{'command':sys.executable,'args':['-c',code]})
    def finish(self,outcome='complete'):
        return self.runtime.dispatch({'op':'finish','session':self.sid,'outcome':outcome,'summary':'Observed verification','verification':[]})
    def test_full_command_output_digest_covers_unseen_tail(self):
        outputs=[]
        for tail in ('A','B'):
            result=self.command("import sys; sys.stdout.write('x'*14000+'"+tail+"'); sys.stderr.write('é')")['result']
            self.assertEqual(result['stdoutSha256'],hashlib.sha256(('x'*14000+tail).encode()).hexdigest())
            self.assertEqual(result['stderrSha256'],hashlib.sha256('é'.encode()).hexdigest())
            self.assertTrue(result['outputPaged']);outputs.append(result)
        self.assertEqual(outputs[0]['stdout'],outputs[1]['stdout'])
        self.assertNotEqual(outputs[0]['stdoutSha256'],outputs[1]['stdoutSha256'])
    def test_external_source_edit_blocks_completion_until_fresh_command(self):
        self.write();result=self.command();self.assertTrue(result['result']['verificationBinding']['stable'])
        self.assertEqual(V.freshness(self.runtime,self.runtime.get(self.sid))['status'],'current')
        (self.root/'source.txt').write_text('external change')
        status=self.runtime.dispatch({'op':'turn','session':self.sid})['verificationFreshness']
        self.assertEqual(status['status'],'stale');self.assertEqual(status['changed'][0]['path'],'source.txt')
        with self.assertRaisesRegex(ValueError,'verification inputs changed'):self.finish()
        self.command("from pathlib import Path; assert Path('source.txt').read_text()=='external change'")
        self.assertEqual(self.finish()['status'],'complete')
    def test_self_mutating_command_needs_followup_verification(self):
        self.write();result=self.command("from pathlib import Path; Path('source.txt').write_text('formatted')")
        self.assertFalse(result['result']['verificationBinding']['stable'])
        with self.assertRaises(ValueError):self.finish()
        self.command();self.assertEqual(self.finish()['status'],'complete')
    def test_deleted_input_and_managed_script_changes_are_detected(self):
        self.write();self.tool('write_script',{'path':'check.py','content':'print(1)'})
        self.command();(self.root/'source.txt').unlink();(self.runtime.get(self.sid)['_dir']/'scripts/check.py').write_text('print(2)')
        status=V.freshness(self.runtime,self.runtime.get(self.sid));self.assertEqual(status['status'],'stale')
        self.assertEqual({(p['kind'],p['path']) for p in status['changed']},{('workspace','source.txt'),('script','check.py')})
        self.assertEqual(self.finish('partial')['events'][-1]['value']['outcome'],'partial')
    def test_read_set_is_bound_even_without_file_tool_edits(self):
        (self.root/'dependency.txt').write_text('dependency version one')
        self.tool('read_file',{'path':'dependency.txt'})
        self.command();(self.root/'dependency.txt').write_text('dependency version two')
        self.assertEqual(V.freshness(self.runtime,self.runtime.get(self.sid))['status'],'stale')
        with self.assertRaises(ValueError):self.finish()
    def test_read_only_unbound_commands_and_failed_commands_are_not_certification(self):
        self.assertEqual(self.command()['result']['verificationBinding']['boundFiles'],0)
        self.assertEqual(V.freshness(self.runtime,self.runtime.get(self.sid))['status'],'unbound')
        self.command('raise SystemExit(1)');self.assertEqual(V.freshness(self.runtime,self.runtime.get(self.sid))['status'],'failed')
    def test_symlink_replacement_is_unavailable_without_following_it(self):
        self.write();self.command();(self.root/'source.txt').unlink();(self.root/'source.txt').symlink_to(Path(__file__))
        status=V.freshness(self.runtime,self.runtime.get(self.sid));self.assertEqual(status['status'],'unavailable');self.assertFalse(status['passed'])
        with self.assertRaises(ValueError):self.finish()
    def test_public_receipt_cannot_mutate_the_private_binding(self):
        self.write();result=self.command()
        self.assertEqual(len(result['result']['verificationBinding']['inputDigest']),64)
        (self.root/'source.txt').write_text('external')
        result['result']['verificationBinding']['inputs'][0]['hash']=hashlib.sha256(b'external').hexdigest()
        self.assertEqual(V.freshness(self.runtime,self.runtime.get(self.sid))['status'],'stale')
    def test_bindings_survive_runtime_reload(self):
        self.write();self.command();self.runtime.close();self.runtime=Runtime(self.root,[sys.executable]);self.addCleanup(self.runtime.close)
        (self.root/'source.txt').write_text('changed after restart')
        self.assertEqual(V.freshness(self.runtime,self.runtime.get(self.sid))['status'],'stale')
