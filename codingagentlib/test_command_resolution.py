"""Executable fallback must preserve command permissions and tool observations."""
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

from codingagentlib import Agent, Runtime


class CommandResolutionTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.name = Path(sys.executable).name
        self.missing = str(self.root / 'old-install' / self.name)
        self.enterContext(patch.dict(os.environ, PATH=str(Path(sys.executable).parent)))

    def runtime(self, commands):
        runtime = Runtime(self.root, commands)
        self.addCleanup(runtime.close)
        return runtime

    def call(self, runtime, command, *, allow=True, tool='run_command', extra=None):
        session = runtime.dispatch({'op': 'start', 'goal': 'Check resolution', 'allowCommands': allow})
        args = {'command': command, 'args': ['-c', 'print("resolved")'], **(extra or {})}
        return runtime.dispatch({'op': 'tool', 'session': session['id'], 'tool': tool, 'callId': 'resolve', 'args': args})

    def test_missing_configured_and_requested_paths_resolve_and_record_actual_executable(self):
        runtime = self.runtime([self.missing])
        for command in [self.missing, self.name, str(self.root / 'another' / self.name)]:
            result = self.call(runtime, command)
            self.assertTrue(result['ok'], result)
            self.assertEqual(result['result']['stdout'].strip(), 'resolved')
            self.assertEqual(result['result']['command'], command)
            self.assertEqual(result['result']['resolvedExecutable'], str(Path(sys.executable).resolve()))

    def test_disappeared_pinned_executable_searches_path_at_execution(self):
        executable = self.bin / self.name
        shutil.copy2(sys.executable, executable)
        runtime = self.runtime([str(executable)])
        executable.unlink()
        result = self.call(runtime, str(executable))
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['result']['resolvedExecutable'], str(Path(sys.executable).resolve()))

    def test_existing_unapproved_path_and_unapproved_basename_are_denied(self):
        runtime = self.runtime([sys.executable])
        executable = self.bin / self.name
        shutil.copy2(sys.executable, executable)
        self.assertFalse(self.call(runtime, str(executable))['ok'])
        self.assertFalse(self.call(runtime, str(self.root / 'old-install' / 'unapproved-tool'))['ok'])
        self.assertFalse(self.call(runtime, self.missing, allow=False)['ok'])
        disabled = self.runtime([])
        self.assertFalse(self.call(disabled, self.missing)['ok'])

    @unittest.skipIf(os.name == 'nt', 'POSIX symlink alias')
    def test_missing_versioned_target_searches_approved_alias(self):
        target = self.bin / 'old-versioned-python-target'
        shutil.copy2(sys.executable, target)
        alias = self.bin / self.name
        alias.symlink_to(target)
        runtime = self.runtime([str(alias)])
        target.unlink()
        self.assertTrue(self.call(runtime, self.missing)['ok'])

    def test_existing_nonexecutable_does_not_fall_back(self):
        if os.name == 'nt':
            self.skipTest('POSIX executable permissions')
        executable = self.bin / self.name
        executable.write_text('not executable')
        executable.chmod(0o600)
        with self.assertRaisesRegex(ValueError, 'not found'):
            self.runtime([str(executable)])

    @unittest.skipUnless(os.name == 'nt', 'Windows PATHEXT')
    def test_windows_existing_unapproved_exe_cannot_be_bypassed_by_omitting_suffix(self):
        runtime = self.runtime([sys.executable])
        executable = self.bin / self.name
        shutil.copy2(sys.executable, executable)
        self.assertIsNone(runtime.resolve_command(str(executable.with_suffix(''))))

    def test_all_command_mode_searches_missing_paths_and_returns_missing_error(self):
        runtime = self.runtime(['*'])
        self.assertTrue(self.call(runtime, self.missing)['ok'])
        result = self.call(runtime, str(self.root / 'old-install' / 'no-such-executable-resolution-test'))
        self.assertFalse(result['ok'])
        self.assertIn('not found', result['error'])
        self.assertIsNone(runtime.resolve_command('bad\0command'))

    def test_managed_script_uses_same_fallback(self):
        runtime = self.runtime([sys.executable])
        session = runtime.dispatch({'op': 'start', 'goal': 'Script', 'allowCommands': True, 'allowEdits': True})
        written = runtime.dispatch({'op': 'tool', 'session': session['id'], 'tool': 'write_script', 'callId': 'write',
                                    'args': {'path': 'check.py', 'content': 'print("script resolved")'}})
        self.assertTrue(written['ok'], written)
        result = runtime.dispatch({'op': 'tool', 'session': session['id'], 'tool': 'run_script', 'callId': 'run',
                                   'args': {'path': 'check.py', 'command': self.missing}})
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['result']['stdout'].strip(), 'script resolved')

    def test_failed_resolution_is_returned_to_model_for_correction(self):
        with Agent(self.root, commands=['*']) as agent:
            def model(request):
                observations = [e['value'] for e in request['events'] if e['kind'] == 'observation']
                action = None
                if not observations:
                    action = {'tool': 'run_command', 'args': {'command': '/missing/no-such-resolution-test'}}
                elif len(observations) == 1:
                    self.assertFalse(observations[0]['ok'])
                    self.assertIn('not found', observations[0]['error'])
                    action = {'tool': 'run_command', 'args': {'command': self.missing, 'args': ['-c', 'print("recovered")']}}
                else:
                    self.assertTrue(observations[-1]['ok'], observations[-1])
                    self.assertEqual(observations[-1]['result']['stdout'].strip(), 'recovered')
                return {'sessionId': request['sessionId'], 'step': request['step'], 'status': 'act' if action else 'done',
                        'plan': 'Inspect failure and correct executable', 'action': action, 'summary': 'Recovered', 'outcome': 'complete'}
            self.assertEqual(agent.run('Resolve executable', model, allow_commands=True)['status'], 'complete')
