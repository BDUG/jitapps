"""Role-Based Multi-Agent Collaboration & Enforced Pre-Retry Reflexion Loop."""
from __future__ import annotations

import copy
from pathlib import Path
import shutil
import tempfile

from .agent_runtime import Runtime, SKIP
from .react import ReactAgent


class MultiAgentOrchestrator:
    """Coordinates specialized personas (Searcher, Coder, Tester, Reviewer).

    The Searcher runs read-only, the Coder works in an isolated workspace
    branch/copy (or shared workspace) and returns changed files, the Tester runs
    verification, and the Reviewer inspects the diff before merging.
    """

    def __init__(self, workspace, commands=()):
        self.workspace = Path(workspace).resolve()
        self.commands = tuple(commands)

    def run(self, goal, *, searcher, coder, tester, reviewer=None):
        # 1. Searcher (strictly read-only)
        with ReactAgent(self.workspace, self.commands) as search_agent:
            search_res = search_agent.run(
                f"[Role: Searcher] Locate all relevant files and symbols for: {goal}",
                searcher,
                allow_edits=False,
                allow_commands=False,
                max_steps=15,
            )

        # 2. Coder (isolated workspace copy so unreviewed edits never corrupt main workspace)
        tmp_dir = Path(tempfile.mkdtemp(prefix='multi-coder-'))
        isolated = tmp_dir / 'ws'
        shutil.copytree(self.workspace, isolated, ignore=shutil.ignore_patterns(*SKIP))
        try:
            with ReactAgent(isolated, self.commands) as code_agent:
                code_res = code_agent.run(
                    f"[Role: Coder] Implement changes for: {goal}\nSearcher findings: {search_res.get('summary', '')}",
                    coder,
                    allow_edits=True,
                    allow_commands=True,
                    max_steps=25,
                )
                s = code_agent.runtime.get(code_res['sessionId'])
                diff = code_agent.runtime.changes(s)['changes']

            # 3. Tester (runs in isolated workspace with coder's changes)
            with ReactAgent(isolated, self.commands) as test_agent:
                test_res = test_agent.run(
                    f"[Role: Tester] Verify changes for: {goal}\nChanged files: {[d['path'] for d in diff]}",
                    tester,
                    allow_edits=False,
                    allow_commands=True,
                    max_steps=15,
                )

            # 4. Optional Reviewer gate before merging back into primary workspace
            review_res = {'approved': True, 'summary': 'No reviewer configured'}
            if reviewer is not None:
                review_res = reviewer({'goal': goal, 'changes': diff, 'coderSummary': code_res.get('summary', ''), 'testResult': test_res})

            merged = []
            if test_res.get('status') == 'complete' and review_res.get('approved', True):
                for item in diff:
                    rel = item['path']
                    src = isolated / rel
                    dst = self.workspace / rel
                    if item['status'] == 'deleted':
                        dst.unlink(missing_ok=True)
                    elif src.is_file():
                        dst.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(src, dst)
                    merged.append(rel)

            return {
                'format': 'codingagentlib/multi-agent-v1',
                'status': 'complete' if (test_res.get('status') == 'complete' and review_res.get('approved', True)) else 'rejected',
                'search': search_res,
                'code': code_res,
                'test': test_res,
                'review': review_res,
                'mergedFiles': merged,
            }
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)


class ReflexionLoop:
    """Enforces verbal self-critique & immediate episodic memory storage on failure."""

    def __init__(self, workspace, commands=()):
        self.agent = ReactAgent(workspace, commands)
        self.runtime = self.agent.runtime

    def close(self):
        self.agent.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def run(self, goal, model, *, max_steps=30, allow_edits=True, allow_commands=True):
        last_failure = [None]
        reflections = []

        def wrapped_model(req):
            # If the previous observation failed, inject mandatory Reflexion prompt
            events = req.get('events') or []
            last_obs = next((e.get('value') for e in reversed(events) if e.get('kind') == 'observation' and not (e.get('value') or {}).get('parentCallId')), None)
            if last_obs:
                res = last_obs.get('result') or {}
                failed = last_obs.get('ok') is False or (isinstance(res.get('exitCode'), int) and res['exitCode'] != 0)
                if failed and last_obs.get('id') != last_failure[0]:
                    last_failure[0] = last_obs.get('id')
                    req['reflexionRequired'] = {
                        'failedCallId': last_obs.get('id'),
                        'tool': last_obs.get('tool'),
                        'error': last_obs.get('error') or f"exitCode={res.get('exitCode')}",
                        'instruction': 'Previous action failed. Include reflection:{observation, adjustment, evidenceIds:[failedCallId]} before retrying.',
                    }

            reply = model(copy.deepcopy(req))
            if isinstance(reply, dict) and req.get('reflexionRequired') and reply.get('status') == 'act':
                refl = reply.get('reflection')
                if not isinstance(refl, dict) or not refl.get('observation') or not refl.get('adjustment'):
                    raise ValueError('ReflexionLoop requires reflection.observation and reflection.adjustment after a failure')
                reflections.append(refl)
                # Persist lesson immediately to MemoryManager + UnifiedMemorySuite (A-MEM + MAGMA)
                if self.runtime.agent_memory:
                    self.runtime.agent_memory.remember(
                        f"Failure on {req['reflexionRequired']['tool']}: {refl['observation']}\nAdjustment: {refl['adjustment']}",
                        kind='lesson',
                        tags=['reflexion', req['reflexionRequired']['tool']],
                        importance=0.8,
                    )
                if self.runtime.memory_suite:
                    self.runtime.memory_suite.amem.add_note(
                        f"Reflexion: {refl['observation']} -> {refl['adjustment']}",
                        context=f"Reflexion after {req['reflexionRequired']['tool']} failure",
                        tags=['reflexion'],
                    )
            return reply

        result = self.agent.run(goal, wrapped_model, allow_edits=allow_edits, allow_commands=allow_commands, max_steps=max_steps)
        result['reflections'] = reflections
        return result
