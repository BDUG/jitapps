import os
from pathlib import Path
import sys
import tempfile
import unittest
from codingagentlib import Runtime

class AllCommandsTests(unittest.TestCase):
    def setUp(self):
        self.temp=self.enterContext(tempfile.TemporaryDirectory());self.root=Path(self.temp)
    def runtime(self,commands):
        runtime=Runtime(self.root,commands);self.addCleanup(runtime.close);return runtime
    def call(self,runtime,command,allow=True):
        session=runtime.dispatch({'op':'start','tool':'headless','goal':'Check policy','allowCommands':allow})
        return runtime.dispatch({'op':'tool','session':session['id'],'tool':'run_command','callId':'policy-check','args':{'command':command,'args':['-c','print("allowed")']}})
    def test_all_resolves_arbitrary_absolute_executable_and_keeps_session_permission(self):
        runtime=self.runtime(['*']);self.assertEqual(runtime.health()['commandPolicy'],'all');self.assertNotIn('*',runtime.health()['commands'])
        # A unique executable outside the starter names, resolved when the command runs.
        if os.name!='nt':
            executable=self.root/'custom-program';executable.symlink_to(sys.executable)
            self.assertEqual(self.call(runtime,str(executable))['result']['stdout'].strip(),'allowed')
        self.assertIsNone(runtime.resolve_command('nonexistent-command-policy-test'))
        self.assertIsNone(runtime.resolve_command('bad\0command'))
        result=self.call(runtime,sys.executable,False);self.assertFalse(result['ok']);self.assertIn('not enabled',result['error'])
    def test_named_allowlist_and_disabled_mode_remain_restricted(self):
        runtime=self.runtime([sys.executable]);self.assertEqual(runtime.health()['commandPolicy'],'allowlist')
        if os.name!='nt':
            executable=self.root/'not-allowed';executable.symlink_to(sys.executable)
            self.assertIsNone(runtime.resolve_command(str(executable)))
        disabled=self.runtime([]);self.assertIsNone(disabled.resolve_command(sys.executable))
