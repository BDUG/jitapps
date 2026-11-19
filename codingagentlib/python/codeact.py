"""Code-as-Action (CodeAct) stateful persistent Python REPL agent.

Instead of emitting rigid JSON tool calls on every turn, the model emits
executable Python code blocks (or ``{"code": "...", "done": false}``) that run
in a persistent subprocess REPL inside the workspace's managed Python
environment. Variables, imports, and helper functions survive across turns,
dramatically reducing multi-step round-trips.
"""
from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from .agent_runtime import Runtime

_REPL_SERVER = r'''
import contextlib, io, json, sys, traceback

ns = {"__name__": "__main__"}
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    if req.get("op") == "close":
        break
    code = req.get("code", "")
    out, err = io.StringIO(), io.StringIO()
    ok, error = True, None
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            exec(compile(code, "<codeact>", "exec"), ns, ns)
    except BaseException:
        ok = False
        error = traceback.format_exc()
    user_vars = sorted(k for k in ns if not k.startswith("_"))[:60]
    print(json.dumps({
        "ok": ok,
        "stdout": out.getvalue()[:32000],
        "stderr": err.getvalue()[:16000],
        "error": error,
        "variables": user_vars,
    }, ensure_ascii=False), flush=True)
'''


def extract_code(reply):
    """Extract Python code and optional completion signal from model output."""
    if isinstance(reply, dict):
        return {
            'code': str(reply.get('code', '')),
            'done': bool(reply.get('done', False)),
            'summary': str(reply.get('summary', '')),
        }
    if not isinstance(reply, str):
        raise ValueError('CodeAct model must return text or dict')
    stripped = reply.strip()
    if stripped.startswith('{'):
        try:
            obj = json.loads(stripped)
            if isinstance(obj, dict):
                return {'code': str(obj.get('code', '')), 'done': bool(obj.get('done', False)), 'summary': str(obj.get('summary', ''))}
        except ValueError:
            pass
    m = re.search(r'```(?:python|py)?\s*\n([\s\S]*?)\n```', stripped)
    if m:
        return {'code': m.group(1), 'done': False, 'summary': ''}
    done_m = re.match(r'^DONE:\s*(.+)$', stripped, re.S)
    if done_m:
        return {'code': '', 'done': True, 'summary': done_m.group(1).strip()}
    return {'code': stripped, 'done': False, 'summary': ''}


class CodeActREPL:
    """Persistent stateful Python REPL subprocess."""

    def __init__(self, cwd, python_exe=None, env=None):
        self.cwd = str(Path(cwd).resolve())
        self.python_exe = python_exe or sys.executable
        self.proc = subprocess.Popen(
            [self.python_exe, '-u', '-c', _REPL_SERVER],
            cwd=self.cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def execute(self, code):
        if self.proc.poll() is not None:
            raise RuntimeError('CodeAct REPL process exited unexpectedly')
        self.proc.stdin.write(json.dumps({'op': 'exec', 'code': code}, ensure_ascii=False) + '\n')
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError('CodeAct REPL returned no output')
        return json.loads(line)

    def close(self):
        if self.proc.poll() is None:
            try:
                self.proc.stdin.write(json.dumps({'op': 'close'}) + '\n')
                self.proc.stdin.flush()
                self.proc.wait(timeout=2)
            except Exception:
                self.proc.kill()
        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            try:
                if stream:
                    stream.close()
            except Exception:
                pass


class CodeActAgent:
    """Runs a Code-as-Action loop with persistent REPL state and Runtime audit."""

    def __init__(self, workspace, commands=(), *, env_name='default'):
        self.runtime = Runtime(workspace, commands)
        self.env_name = env_name

    def close(self):
        self.runtime.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def run(self, goal, model, *, max_steps=20, allow_edits=True, allow_commands=True, env_name=None):
        session = self.runtime.start({'goal': goal, 'allowEdits': allow_edits, 'allowCommands': allow_commands})
        sid = session['id']
        s = self.runtime.get(sid)
        if not allow_commands:
            raise PermissionError('CodeAct requires allow_commands=True')

        py_exe = sys.executable
        proc_env = dict(os.environ)
        if self.runtime.pyenvs:
            pyenvs = self.runtime._session_pyenvs(s)
            if pyenvs.backend()['name']:
                pyenvs.ensure(env_name or self.env_name)
                py_exe = str(pyenvs.interpreter(env_name or self.env_name))
                proc_env = pyenvs.environment(env_name or self.env_name)

        repl = CodeActREPL(self.runtime.root, python_exe=py_exe, env=proc_env)
        history = []
        try:
            for step in range(1, max_steps + 1):
                req = {
                    'format': 'codingagentlib/codeact-v1',
                    'sessionId': sid,
                    'step': step,
                    'goal': goal,
                    'workspace': str(self.runtime.root),
                    'history': history[-12:],
                    'instructions': 'Emit a ```python``` block (or {"code":"...","done":false}) to inspect or modify the workspace. Variables persist across steps. Return {"done":true,"summary":"..."} when finished.',
                }
                parsed = extract_code(model(req))
                if parsed['done'] and not parsed['code'].strip():
                    self.runtime.event(s, 'completion', {'summary': parsed['summary'], 'outcome': 'complete'})
                    return {'status': 'complete', 'sessionId': sid, 'steps': step, 'summary': parsed['summary'], 'history': history}
                obs = repl.execute(parsed['code'])
                record = {'step': step, 'code': parsed['code'], **obs}
                history.append(record)
                self.runtime.event(s, 'observation', {'id': f'ca_{step}', 'tool': 'codeact_repl', 'ok': obs['ok'], 'result': obs})
                if parsed['done']:
                    self.runtime.event(s, 'completion', {'summary': parsed['summary'], 'outcome': 'complete'})
                    return {'status': 'complete', 'sessionId': sid, 'steps': step, 'summary': parsed['summary'], 'history': history}
            return {'status': 'paused', 'reason': 'step_budget', 'sessionId': sid, 'steps': max_steps, 'history': history}
        finally:
            repl.close()
