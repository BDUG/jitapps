"""Hybrid Plan-and-Execute + Reflexion + ReAct orchestrator."""
from __future__ import annotations

import copy
import json

from .react import ReactAgent


class HybridPlanReflexionAgent:
    """Combines Plan-and-Execute (DAG task decomposition & adaptive replanning),
    Reflexion (mandatory verbal self-critique + episodic memory capture on failure),
    and ReAct (per-step Thought -> Action -> Observation execution).
    """

    def __init__(self, workspace, commands=()):
        self.workspace = workspace
        self.commands = tuple(commands)

    def _run_task_with_reflexion(
        self,
        task,
        executor,
        *,
        completed,
        reflections,
        allow_edits,
        allow_commands,
        max_steps,
        otel_tracer=None,
        stream_sink=None,
    ):
        last_failure = [None]
        task_reflections = []

        with ReactAgent(self.workspace, self.commands) as agent:
            def wrapped_model(req):
                events = req.get('events') or []
                last_obs = next(
                    (e.get('value') for e in reversed(events) if e.get('kind') == 'observation' and not (e.get('value') or {}).get('parentCallId')),
                    None,
                )
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

                req['hybridContext'] = {
                    'taskId': task['id'],
                    'taskTitle': task.get('title', task['id']),
                    'completedTasks': list(completed.values()),
                    'priorReflections': reflections[-5:],
                }

                raw = executor(copy.deepcopy(req))
                parsed = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(parsed, dict) and req.get('reflexionRequired') and parsed.get('status') == 'act':
                    refl = parsed.get('reflection')
                    if not isinstance(refl, dict) or not refl.get('observation') or not refl.get('adjustment'):
                        raise ValueError('HybridPlanReflexionAgent requires reflection.observation and reflection.adjustment after a failure')
                    entry = {'taskId': task['id'], 'tool': req['reflexionRequired']['tool'], **refl}
                    task_reflections.append(entry)
                    reflections.append(entry)
                    if agent.runtime.agent_memory:
                        agent.runtime.agent_memory.remember(
                            f"[{task['id']}] Failure on {req['reflexionRequired']['tool']}: {refl['observation']}\nAdjustment: {refl['adjustment']}",
                            kind='lesson',
                            tags=['hybrid', 'reflexion', req['reflexionRequired']['tool']],
                            importance=0.85,
                        )
                    if agent.runtime.memory_suite:
                        agent.runtime.memory_suite.amem.add_note(
                            f"Reflexion ({task['id']}): {refl['observation']} -> {refl['adjustment']}",
                            context=f"Hybrid Reflexion after {req['reflexionRequired']['tool']} failure",
                            tags=['hybrid', 'reflexion'],
                        )
                return raw

            res = agent.run(
                task.get('goal') or task.get('title') or task['id'],
                wrapped_model,
                allow_edits=allow_edits,
                allow_commands=allow_commands,
                max_steps=max_steps,
                otel_tracer=otel_tracer,
                stream_sink=stream_sink,
            )
        return res, task_reflections

    def run(
        self,
        goal,
        *,
        planner,
        executor,
        replanner=None,
        allow_edits=True,
        allow_commands=True,
        max_task_steps=20,
        max_replans=2,
        otel_tracer=None,
        stream_sink=None,
    ):
        plan = list(planner(goal) or [])
        completed = {}
        ordered = []
        reflections = []
        replans = 0

        while len(completed) < len(plan):
            ready = [t for t in plan if t['id'] not in completed and all(d in completed for d in t.get('dependsOn') or ())]
            if not ready:
                raise ValueError('Cyclic or unresolvable task dependencies in hybrid plan')

            made_progress = False
            for task in ready:
                res, task_refl = self._run_task_with_reflexion(
                    task,
                    executor,
                    completed=completed,
                    reflections=reflections,
                    allow_edits=allow_edits,
                    allow_commands=allow_commands,
                    max_steps=max_task_steps,
                    otel_tracer=otel_tracer,
                    stream_sink=stream_sink,
                )
                record = {
                    'taskId': task['id'],
                    'title': task.get('title', task['id']),
                    'status': res['status'],
                    'summary': res.get('summary', ''),
                    'reflections': task_refl,
                }
                if res['status'] == 'complete' and res.get('outcome') not in ('blocked', 'partial'):
                    completed[task['id']] = record
                    ordered.append(record)
                    made_progress = True
                    continue

                if replanner is not None and replans < max_replans:
                    replans += 1
                    revised = replanner({
                        'goal': goal,
                        'failedTask': task,
                        'taskResult': res,
                        'completed': list(completed.values()),
                        'reflections': reflections,
                        'remainingPlan': [t for t in plan if t['id'] not in completed],
                    })
                    if isinstance(revised, dict):
                        if revised.get('reflection'):
                            reflections.append({'taskId': task['id'], 'replan': True, **revised['reflection']})
                        next_tasks = list(revised.get('tasks') or [])
                    else:
                        next_tasks = list(revised or [])
                    plan = [t for t in plan if t['id'] in completed] + next_tasks
                    made_progress = True
                    break

                ordered.append(record)
                return {
                    'status': 'partial',
                    'goal': goal,
                    'plan': plan,
                    'tasks': ordered,
                    'reflections': reflections,
                    'replans': replans,
                }

            if not made_progress:
                break

        return {
            'status': 'complete',
            'goal': goal,
            'plan': plan,
            'tasks': ordered,
            'reflections': reflections,
            'replans': replans,
        }
