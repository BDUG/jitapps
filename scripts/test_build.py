"""Exercise build orchestration without downloading toolchains or publishing."""
import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("suite_build", ROOT / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildTests(unittest.TestCase):
    def invoke(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            result = build.main(list(args))
        return result, out.getvalue()

    def test_dry_run_is_non_mutating_for_all_targets(self):
        with patch.object(build.subprocess, "run") as run, patch.object(build.Path, "mkdir") as mkdir:
            code, text = self.invoke("all", "--install-deps", "--dry-run")
        self.assertEqual(code, 0)
        self.assertEqual(text.count("Planned output:"), 5)
        self.assertIn("pip install", text)
        self.assertIn("npm ci --ignore-scripts", text)
        run.assert_not_called()
        mkdir.assert_not_called()

    def test_failure_stops_remaining_targets_and_preserves_exit_code(self):
        with patch.object(build.shutil, "which", side_effect=lambda x: x), \
                patch.object(build.Path, "mkdir"), \
                patch.object(build.subprocess, "run", side_effect=subprocess.CalledProcessError(23, "npm")) as run:
            code, text = self.invoke("all")
        self.assertEqual(code, 23)
        self.assertEqual(run.call_count, 1)
        self.assertIn("Build failed", text)
        self.assertNotIn("Build output:", text)

    def test_missing_tool_preflight_changes_no_files(self):
        with patch.object(build.shutil, "which", return_value=None), \
                patch.object(build.subprocess, "run") as run, patch.object(build.Path, "mkdir") as mkdir:
            code, text = self.invoke("all", "--install-deps")
        self.assertEqual(code, 1)
        self.assertIn("Missing executable", text)
        run.assert_not_called()
        mkdir.assert_not_called()

    def test_native_vsix_matches_host_and_current_manifest(self):
        for system, cpu, target in [("Windows", "AMD64", "win32-x64"), ("Darwin", "arm64", "darwin-arm64"), ("Linux", "aarch64", "linux-arm64")]:
            with patch.object(build.platform, "system", return_value=system), patch.object(build.platform, "machine", return_value=cpu):
                steps, output = build.plan("vscode")
            self.assertIn(target, steps[-1][1])
            self.assertIn(target, output.name)
            self.assertEqual(steps[0][1], ["npm", "run", "verify"])
            self.assertIn("--out", steps[-1][1])

    def test_native_vsix_rejects_unknown_host(self):
        with patch.object(build.platform, "machine", return_value="unknown"):
            code, text = self.invoke("vscode", "--dry-run")
        self.assertEqual(code, 1)
        self.assertIn("Unsupported native VSIX host", text)

    def test_commands_use_arg_arrays_repo_cwd_and_build_interpreter(self):
        with tempfile.TemporaryDirectory(prefix="build tests with spaces ") as folder:
            with patch.object(build, "ROOT", Path(folder)), \
                    patch.object(build.shutil, "which", side_effect=lambda x: x), \
                    patch.object(build.subprocess, "run") as run:
                code, _ = self.invoke("python")
            self.assertEqual(code, 0)
            command = run.call_args.args[0]
            self.assertEqual(command[0], build.sys.executable)
            self.assertEqual(command[-1], str(Path(folder) / "codingagentlib"))
            self.assertEqual(run.call_args.kwargs["cwd"], Path(folder) / "dist/python")
            self.assertEqual(run.call_args.kwargs["env"]["PYTHON"], build.sys.executable)
            self.assertTrue(run.call_args.kwargs["check"])

    def test_shell_wrapper_works_outside_repository(self):
        if build.os.name == "nt":
            self.skipTest("POSIX wrapper")
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run([str(ROOT / "build.sh"), "sdks", "--dry-run"], cwd=folder, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count("Planned output:"), 3)


if __name__ == "__main__":
    unittest.main()
