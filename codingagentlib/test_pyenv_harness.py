import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

from codingagentlib import PythonEnvironments, Runtime, ScriptLibrary
from codingagentlib.python.agent_pyenv import inline_metadata, validate_packages


SCRATCH_UV = Path('/home/dirk/.gemini/antigravity/brain/29d6fa2e-69e2-4181-96fd-3854bb5fdb2d/scratch/uvenv/bin/uv')


class PyEnvAndHarnessTests(unittest.TestCase):
    def test_package_validation_and_pep723_metadata(self):
        self.assertEqual(validate_packages(['requests>=2.31', 'pydantic[email]==2.9.0']), ['requests>=2.31', 'pydantic[email]==2.9.0'])
        for bad in ['git+https://example.com/repo.git', '-e .', '--index-url=https://evil.invalid', 'pkg; os_name=="nt"', '../local']:
            with self.assertRaises(ValueError):
                validate_packages([bad])
        src = '# /// script\n# requires-python = ">=3.10"\n# dependencies = ["httpx>=0.27", "rich"]\n# ///\nprint("hi")\n'
        meta = inline_metadata(src)
        self.assertEqual(meta['dependencies'], ['httpx>=0.27', 'rich'])
        self.assertEqual(meta['requiresPython'], '>=3.10')

    def test_uv_or_venv_creation_and_runtime_script_run(self):
        with tempfile.TemporaryDirectory() as ws, tempfile.TemporaryDirectory() as env_dir:
            uv_bin = str(SCRATCH_UV) if SCRATCH_UV.exists() else shutil.which('uv')
            if uv_bin:
                envs = PythonEnvironments(env_dir, resolve=lambda n: uv_bin if n == 'uv' else shutil.which(n), uv=uv_bin)
                self.assertEqual(envs.backend()['name'], 'uv')
                created = envs.create('fast')
                self.assertTrue(created['created'])
                self.assertEqual(created['backend'], 'uv')
                self.assertTrue(envs.interpreter('fast').exists())
            # Also verify stdlib venv fallback when uv is disallowed
            fallback = PythonEnvironments(Path(env_dir) / 'fallback', resolve=lambda n: None if n == 'uv' else shutil.which(n))
            self.assertEqual(fallback.backend()['name'], 'venv')
            fb_created = fallback.create('std')
            self.assertTrue(fb_created['created'])
            self.assertEqual(fb_created['backend'], 'venv')

            # Full runtime integration: script_run with agent_io, artifacts, auto-capture, and library rerun
            runtime = Runtime(ws, [sys.executable, 'python3'])
            try:
                session = runtime.start({'goal': 'Run data script', 'allowEdits': True, 'allowCommands': True})
                sid = session['id']
                s = runtime.get(sid)
                source = '''"""Summarize numbers from structured input."""
# tags: math, summary
import json, pathlib, agent_io

data = agent_io.load_input()
nums = data.get("numbers", [])
out_file = pathlib.Path(agent_io.artifact_dir()) / "summary.txt"
out_file.write_text(f"count={len(nums)}", encoding="utf-8")
agent_io.emit({"total": sum(nums), "count": len(nums)})
'''
                res = runtime.tool(s, 'script_run', {'source': source, 'filename': 'sum_nums.py', 'input': {'numbers': [2, 3, 5]}}, 'c1', enforce_plan=False)
                self.assertTrue(res['ok'])
                r = res['result']
                self.assertEqual(r['exitCode'], 0)
                self.assertEqual(r['structuredResult'], {'total': 10, 'count': 3})
                self.assertEqual([a['name'] for a in r['artifacts']], ['summary.txt'])
                self.assertIn('libraryEntry', r)
                lib_id = r['libraryEntry']['id']

                # Search & rerun from library
                found = runtime.tool(s, 'script_library', {'action': 'search', 'query': 'summarize numbers'}, 'c2', enforce_plan=False)
                self.assertTrue(found['ok'])
                self.assertTrue(any(m['id'] == lib_id for m in found['result']['matches']))

                rerun = runtime.tool(s, 'script_run', {'libraryId': lib_id, 'input': {'numbers': [10, 20]}}, 'c3', enforce_plan=False)
                self.assertTrue(rerun['ok'])
                self.assertEqual(rerun['result']['structuredResult'], {'total': 30, 'count': 2})
                runs = runtime.tool(s, 'script_library', {'action': 'runs', 'id': lib_id}, 'c4', enforce_plan=False)
                self.assertEqual(len(runs['result']['runs']), 1)
                self.assertTrue(runs['result']['runs'][0]['ok'])
            finally:
                runtime.close()

    def test_script_library_screening_revisions_and_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = ScriptLibrary(Path(tmp) / 'scripts.sqlite3')
            # Credential and absolute home path are blocked from auto-capture
            rec, reason = lib.capture('bad.py', 'API_KEY = "sk-1234567890abcdef1234"\nprint(API_KEY)\n')
            self.assertIsNone(rec)
            self.assertIn('credential', reason)
            rec2, reason2 = lib.capture('abs.py', 'p = "/home/alice/secret"\nprint(p)\n')
            self.assertIsNone(rec2)
            self.assertIn('absolute path', reason2)

            saved = lib.save({'id': 'hello-tool', 'tags': ['util'], 'description': 'Greets'}, 'print("v1")\n', expected_revision=0)
            self.assertEqual(saved['revision'], 1)
            updated = lib.save({'id': 'hello-tool', 'tags': ['util']}, 'print("v2")\n', expected_revision=1)
            self.assertEqual(updated['revision'], 2)
            with self.assertRaises(ValueError):
                lib.save({'id': 'hello-tool'}, 'print("stale")\n', expected_revision=1)
            bundle = lib.export(['hello-tool'])
            lib2 = ScriptLibrary(Path(tmp) / 'scripts2.sqlite3')
            imp = lib2.import_bundle(bundle)
            self.assertEqual(len(imp['imported']), 1)
            self.assertEqual(lib2.read('hello-tool')['source'], 'print("v2")\n')


if __name__ == '__main__':
    unittest.main()
