import os
from pathlib import Path
import sys
import tempfile
import unittest
from codingagentlib import Runtime

@unittest.skipIf(os.name=='nt','POSIX executable launch fixtures')
class LaunchTests(unittest.TestCase):
    def test_failed_launch_keeps_diagnostics_after_restart_and_does_not_verify(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            program=root/'broken-tool';program.write_text('#!/missing/suite-test-interpreter\n');program.chmod(0o700)
            runtime=Runtime(root,[str(program),sys.executable])
            try:
                session=runtime.start({'goal':'Diagnose missing interpreter','allowCommands':True})['id']
                observation=runtime.dispatch({'op':'tool','session':session,'tool':'run_command','callId':'launch','args':{'command':str(program)}})
                self.assertFalse(observation['ok']);self.assertEqual(observation['code'],'command_launch_failed')
                result=observation['result'];self.assertFalse(result['started']);self.assertIsNone(result['exitCode'])
                self.assertEqual(result['launchError']['code'],'missing_executable_or_interpreter')
                self.assertEqual(runtime.get(session)['verificationBinding']['successful'],False)
                job=result['jobId'];self.assertIn(job,runtime.get(session)['jobs'])
                self.assertIsNone(runtime.get(session)['_active']);self.assertTrue(runtime.slots.acquire(False));runtime.slots.release()
            finally:runtime.close()
            runtime=Runtime(root,[str(program),sys.executable])
            try:
                runtime.dispatch({'op':'resume','session':session})
                output=runtime.dispatch({'op':'tool','session':session,'tool':'read_command_output','callId':'diagnostics','args':{'jobId':job,'stream':'stderr'}})
                self.assertTrue(output['ok']);self.assertIn(str(program),output['result']['text'])
                corrected=runtime.dispatch({'op':'tool','session':session,'tool':'run_command','callId':'fixed','args':{'command':sys.executable,'args':['-c','print("recovered")']}})
                self.assertTrue(corrected['ok']);self.assertEqual(corrected['result']['exitCode'],0)
            finally:runtime.close()
    def test_invalid_binary_gets_format_diagnostic_without_shell_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);program=root/'invalid';program.write_bytes(b'not an executable\x00');program.chmod(0o700)
            runtime=Runtime(root,[str(program)])
            try:
                session=runtime.start({'goal':'Inspect executable format','allowCommands':True})['id']
                result=runtime.dispatch({'op':'tool','session':session,'tool':'run_command','callId':'format','args':{'command':str(program)}})
                self.assertFalse(result['ok']);self.assertEqual(result['result']['launchError']['code'],'invalid_executable_format')
                self.assertFalse(result['result']['started'])
            finally:runtime.close()
