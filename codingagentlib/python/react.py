"""High-level ReAct (Reason + Act + Observe + Reflect) coding-agent driver.

Builds on :class:`codingagentlib.python.agent.Agent` and the guarded workspace
runtime while adding:

- Context compaction for long runs (keeps recent events verbatim, summarizes
  older events with ``read_history`` recovery pointers).
- Deterministic ``workingBrief`` and ``decisionGuidance`` ledgers derived from
  actual observations.
- Automatic long-term memory recall + scratchpad injection (via
  ``MemoryManager``) and automatic episode/lesson capture on completion.
- Optional multi-action turn batching (``actions: [...]``): consecutive
  actions are executed one by one through the normal audited ``Agent`` turn
  cycle, stopping immediately on failure or revision conflict.
- Action-cycle / stall detection and structured repair hints on invalid model
  replies or rejected completions.
- Wall-clock, model-call and tool-call budgets plus cancellation and rich
  lifecycle callbacks.
"""
from __future__ import annotations

import copy
import json
import time

from .agent import Agent
from .decision_model import consult_decision_model, resolve_mode

EDIT_TOOLS = {'write_file', 'replace_text', 'apply_edits', 'apply_patch', 'delete_file', 'write_script', 'delete_script', 'restore_file'}
COMMAND_TOOLS = {'run_command', 'run_script', 'script_run'}


def _canonical(value):
    if isinstance(value, list):
        return [_canonical(v) for v in value]
    if isinstance(value, dict):
        return {k: _canonical(value[k]) for k in sorted(value)}
    return value


def _signature(action):
    return json.dumps(_canonical({'tool': action.get('tool'), 'args': action.get('args', {})}), sort_keys=True, separators=(',', ':'))


def _failed(obs):
    res = obs.get('result') or {}
    return (obs.get('ok') is False
            or (obs.get('checks') or {}).get('passed') is False
            or bool(res.get('timedOut'))
            or bool(res.get('cancelled'))
            or (isinstance(res.get('exitCode'), int) and res['exitCode'] != 0))


def _working_brief(events):
    actions, files, commands = {}, {}, []
    last_edit, latest_instruction = -1, None
    for index, event in enumerate(events):
        val = event.get('value') or {}
        kind = event.get('kind')
        if kind == 'user' and val.get('status') == 'follow_up':
            latest_instruction = {'eventIndex': event.get('index', index), 'text': str(val.get('text', ''))[:500]}
        elif kind == 'action' and val.get('id'):
            actions[val['id']] = val
        elif kind == 'observation' and not val.get('parentCallId'):
            tool = val.get('tool')
            args = (actions.get(val.get('id')) or {}).get('args') or {}
            if val.get('ok') and tool in EDIT_TOOLS:
                last_edit = index
                path = args.get('path') or (val.get('result') or {}).get('path')
                if path:
                    files[path] = {'path': path, 'tool': tool, 'callId': val.get('id')}
            if tool in COMMAND_TOOLS:
                res = val.get('result') or {}
                passed = val.get('ok') is True and (val.get('checks') or {}).get('passed') is not False and res.get('exitCode') == 0 and not res.get('timedOut') and not res.get('cancelled')
                commands.append({'callId': val.get('id'), 'tool': tool, 'jobId': res.get('jobId'), 'exitCode': res.get('exitCode'), 'passed': passed, 'index': index})
    latest = commands[-1] if commands else None
    return {
        'changedFiles': list(files.values())[-20:],
        'changedFileCount': len(files),
        'latestInstruction': latest_instruction,
        'latestCommand': ({k: v for k, v in latest.items() if k != 'index'} | {'afterLatestEdit': latest['index'] > last_edit}) if latest else None,
        'verificationPending': last_edit >= 0 and (latest is None or not latest['passed'] or latest['index'] < last_edit),
    }


def _detect_loop(events, *, window=24):
    actions, history = {}, []
    for event in events:
        val = event.get('value') or {}
        if val.get('parentCallId'):
            continue
        if event.get('kind') == 'user' and val.get('status') == 'follow_up':
            history.clear()
        elif event.get('kind') == 'action' and val.get('id'):
            actions[val['id']] = val
        elif event.get('kind') == 'observation' and val.get('id') in actions:
            action = actions[val['id']]
            res = dict(val.get('result') or {})
            res.pop('jobId', None)
            res.pop('finishedAt', None)
            res.pop('durationMs', None)
            history.append((_signature(action), json.dumps(_canonical({'ok': val.get('ok'), 'error': val.get('error'), 'exitCode': res.get('exitCode')}), sort_keys=True)))
            if len(history) > window:
                history.pop(0)
    for period in range(1, 5):
        if len(history) >= period * 3:
            tail = history[-period * 3:]
            if all(tail[i] == tail[i % period] for i in range(len(tail))):
                return {'detected': True, 'period': period, 'repetitions': 3,
                        'note': 'The last %d action(s) repeated 3 times with the same result. Change approach, inspect outputs, or ask/finish partial.' % period}
    return None


def _compact_events(events, *, max_events=36, keep_recent=16, max_chars=60000):
    encoded_len = len(json.dumps(events, ensure_ascii=False))
    if len(events) <= max_events and encoded_len <= max_chars:
        return events, None
    cutoff = max(0, len(events) - keep_recent)
    older, recent = events[:cutoff], events[cutoff:]
    actions = {}
    summary_lines = []
    for ev in older:
        kind = ev.get('kind')
        val = ev.get('value') or {}
        if kind == 'action' and val.get('id'):
            actions[val['id']] = val
        elif kind == 'observation' and not val.get('parentCallId'):
            tool = val.get('tool')
            args = (actions.get(val.get('id')) or {}).get('args') or {}
            target = args.get('path') or args.get('command') or args.get('id') or args.get('query') or ''
            res = val.get('result') or {}
            status = 'ok' if not _failed(val) else ('err:' + str(val.get('error') or res.get('exitCode') or 'failed')[:80])
            summary_lines.append(f"#{ev.get('index')} {tool}({str(target)[:60]}) -> {status}")
        elif kind == 'user' and isinstance(val, dict) and val.get('status') == 'follow_up':
            summary_lines.append(f"#{ev.get('index')} FOLLOW_UP: {str(val.get('text', ''))[:160]}")
        elif kind == 'assistant' and val.get('status') in ('ask', 'done'):
            summary_lines.append(f"#{ev.get('index')} {val.get('status')}: {str(val.get('question') or val.get('summary') or '')[:120]}")
    ledger = {
        'compactedEvents': len(older),
        'keptRecentEvents': len(recent),
        'timeline': summary_lines[-40:],
        'note': 'Older events were compacted. Use read_history(index=...) to inspect any full historical event.',
    }
    return recent, ledger


def _decision_guidance(brief, events, loop_info):
    last_obs = next((e.get('value') for e in reversed(events) if e.get('kind') == 'observation' and not (e.get('value') or {}).get('parentCallId')), None)
    if loop_info:
        return {'phase': 'adapt', 'reason': loop_info['note']}
    if last_obs and _failed(last_obs):
        return {'phase': 'adapt', 'reason': 'The latest action failed (%s). Diagnose the error or read retained logs before retrying.' % (last_obs.get('error') or last_obs.get('tool'))}
    if brief.get('verificationPending'):
        return {'phase': 'verify', 'reason': 'Edits were made after the last passing command. Run verification (run_command, run_script, or script_run) before completing.'}
    if not last_obs:
        return {'phase': 'sense', 'reason': 'Inspect workspace files, project knowledge, or recalled memory before editing.'}
    return {'phase': 'plan', 'reason': 'Proceed with the next step toward the goal, or conclude with status="done" once verified.'}


def _parse_response(raw):
    if isinstance(raw, dict):
        return copy.deepcopy(raw)
    if not isinstance(raw, str):
        raise ValueError('Model must return a dict or JSON string')
    text = raw.strip()
    if text.startswith('```'):
        lines = text.splitlines()
        if lines and lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        text = '\n'.join(lines).strip()
    try:
        value = json.loads(text)
    except ValueError:
        start = text.find('{')
        if start < 0:
            raise ValueError('Expected a JSON object in model response') from None
        decoder = json.JSONDecoder()
        value, _ = decoder.raw_decode(text, start)
    if not isinstance(value, dict):
        raise ValueError('Model response must be a JSON object')
    return value


class ReactAgent:
    """Powerful ReAct loop over :class:`Agent` / :class:`Runtime`."""

    def __init__(
        self,
        workspace,
        commands=(),
        *,
        agent=None,
        exclusive_workspace=False,
        max_context_events=36,
        keep_recent_events=16,
        max_context_chars=60000,
        max_actions_per_turn=6,
        decision_model=None,
        decision_mode='auto',
        _subagent_depth=0,
        **runtime_options,
    ):
        if agent is not None:
            self.agent = agent
            self._owns_agent = False
        else:
            if exclusive_workspace:
                from .coding import Agent as CodingAgent
                self.agent = CodingAgent(workspace, commands, **runtime_options)
            else:
                self.agent = Agent(workspace, commands, **runtime_options)
            self._owns_agent = True
        self.runtime = self.agent.runtime
        self.max_context_events = max_context_events
        self.keep_recent_events = keep_recent_events
        self.max_context_chars = max_context_chars
        self.max_actions_per_turn = max_actions_per_turn
        self.decision_model = decision_model
        self.decision_mode = resolve_mode(decision_model, decision_mode)
        self._subagent_depth = _subagent_depth

    def close(self):
        if self._owns_agent:
            self.agent.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def _emit(self, on_event, kind, **payload):
        if on_event:
            on_event({'kind': kind, **payload})

    def _emit_protocol(self, observer, stream_sink, kind, **payload):
        ev = {'kind': kind, **payload}
        if observer is not None:
            observer.on_event(ev)
        if stream_sink is not None:
            stream_sink(ev)

    def _build_request(self, raw_request, *, repair_hint=None):
        req = copy.deepcopy(raw_request)
        events = req.get('events') or []
        brief = _working_brief(events)
        loop_info = _detect_loop(events)
        recent, compacted = _compact_events(
            events,
            max_events=self.max_context_events,
            keep_recent=self.keep_recent_events,
            max_chars=self.max_context_chars,
        )
        req['events'] = recent
        if compacted is not None:
            req['compactedHistory'] = compacted
        req['workingBrief'] = brief
        req['decisionGuidance'] = _decision_guidance(brief, events, loop_info)
        if loop_info is not None:
            req['loopWarning'] = loop_info
        if repair_hint is not None:
            req['repairHint'] = repair_hint
        if self._subagent_depth < 2 and isinstance(req.get('tools'), list):
            req['tools'].append({
                'name': 'spawn_agent',
                'description': 'Spawn a bounded child coding agent on the workspace for an isolated subtask. Inherits/caps parent permissions.',
                'arguments': {
                    'goal': 'clear subtask goal',
                    'allowEdits': 'optional boolean (capped by parent)',
                    'allowCommands': 'optional boolean (capped by parent)',
                    'maxSteps': 'optional integer 1..15, default 8',
                },
            })
        return req

    def run(
        self,
        goal,
        model,
        *,
        session_id=None,
        answer='',
        allow_edits=False,
        allow_commands=False,
        acceptance_rules=None,
        project=None,
        remember_sessions=None,
        decision_model=None,
        decision_mode=None,
        max_steps=100,
        max_model_calls=100,
        max_elapsed_ms=600000,
        cancel_event=None,
        on_event=None,
        otel_tracer=None,
        stream_sink=None,
    ):
        if type(max_steps) is not int or not 1 <= max_steps <= 100000:
            raise ValueError('max_steps must be 1–100000')
        if type(max_model_calls) is not int or not 1 <= max_model_calls <= 100000:
            raise ValueError('max_model_calls must be 1–100000')
        active_decision_model = decision_model if decision_model is not None else self.decision_model
        active_decision_mode = resolve_mode(active_decision_model, decision_mode if decision_mode is not None else (self.decision_mode if decision_model is None else 'auto'))
        if session_id is None:
            session = self.agent.start(
                goal,
                allow_edits=allow_edits,
                allow_commands=allow_commands,
                acceptance_rules=acceptance_rules,
                project=project,
                remember_sessions=remember_sessions,
            )
            session_id = session['id']
        else:
            session = self.agent.dispatch({'op': 'resume', 'session': session_id})
            if answer:
                self.agent.dispatch({'op': 'event', 'session': session_id, 'value': {'status': 'follow_up', 'text': answer}})
            elif goal and goal != session.get('goal'):
                self.agent.dispatch({'op': 'event', 'session': session_id, 'value': {'status': 'follow_up', 'text': goal}})
        self.agent.invalid[session_id] = 0
        otel_observer = None
        if otel_tracer is not None:
            from .otel_genai import ReactOtelObserver
            otel_observer = ReactOtelObserver(otel_tracer)
        sink_fn = stream_sink.emit if hasattr(stream_sink, 'emit') else stream_sink
        self._emit_protocol(otel_observer, sink_fn, 'start', sessionId=session_id, goal=goal)

        started = time.monotonic()
        model_calls = 0
        steps_taken = 0
        repair_hint = None
        gate_rejections = 0

        while steps_taken < max_steps and model_calls < max_model_calls:
            if cancel_event and cancel_event.is_set():
                self.runtime.cancel(self.runtime.get(session_id))
                return {'status': 'paused', 'reason': 'cancelled', 'sessionId': session_id, 'modelCalls': model_calls, 'steps': steps_taken}
            if max_elapsed_ms and (time.monotonic() - started) * 1000 >= max_elapsed_ms:
                self.runtime.cancel(self.runtime.get(session_id))
                return {'status': 'paused', 'reason': 'elapsed_budget', 'sessionId': session_id, 'modelCalls': model_calls, 'steps': steps_taken}

            raw_request = self.agent.next(session_id)
            request = self._build_request(raw_request, repair_hint=repair_hint)
            repair_hint = None
            if active_decision_mode in ('assist', 'gate'):
                decision = consult_decision_model(active_decision_model, request)
                request['decision'] = decision
                self._emit(on_event, 'decision', sessionId=session_id, step=request['step'], mode=active_decision_mode, decision=decision)
            self._emit(on_event, 'sense', sessionId=session_id, step=request['step'], guidance=request['decisionGuidance'])
            self._emit_protocol(otel_observer, sink_fn, 'step_start', sessionId=session_id, step=request['step'])

            model_calls += 1
            try:
                raw_reply = model(copy.deepcopy(request))
            except BaseException:
                self.runtime.cancel(self.runtime.get(session_id))
                raise

            if cancel_event and cancel_event.is_set():
                self.runtime.cancel(self.runtime.get(session_id))
                return {'status': 'paused', 'reason': 'cancelled', 'sessionId': session_id, 'modelCalls': model_calls, 'steps': steps_taken}

            try:
                parsed = _parse_response(raw_reply)
            except ValueError as error:
                result = self.agent.submit(session_id, raw_reply if isinstance(raw_reply, str) else json.dumps(raw_reply))
                self._emit(on_event, 'repair', sessionId=session_id, step=request['step'], error=str(error), result=result)
                if result['status'] != 'retry':
                    return {**result, 'modelCalls': model_calls, 'steps': steps_taken}
                repair_hint = {'step': request['step'], 'error': str(error), 'note': 'Return a single valid JSON ModelResponse matching responseSchema.'}
                continue

            if active_decision_mode == 'gate' and parsed.get('status') in ('act', 'done') and gate_rejections < 2:
                gate = consult_decision_model(active_decision_model, request, candidate=parsed)
                self._emit(on_event, 'decision_gate', sessionId=session_id, step=request['step'], decision=gate)
                if not gate['approve'] or gate['stopRecommended']:
                    gate_rejections += 1
                    self.agent.submit(session_id, json.dumps({'sessionId': session_id, 'step': request['step'], 'status': 'invalid_gate'}))
                    repair_hint = {'step': request['step'], 'source': 'decision_model', 'rationale': gate['rationale'] or 'Decision model rejected proposed action/completion.', 'strategy': gate['strategy']}
                    continue
            gate_rejections = 0

            # Support optional multi-action batching: `actions: [...]`
            batch = parsed.pop('actions', None)
            if parsed.get('status') == 'act' and isinstance(batch, list) and batch:
                if len(batch) > self.max_actions_per_turn:
                    batch = batch[:self.max_actions_per_turn]
                first = {**parsed, 'action': batch[0]}
                result = self.agent.submit(session_id, first)
                steps_taken += 1
                self._emit(on_event, 'observe', sessionId=session_id, step=request['step'], result=result)
                if result['status'] == 'retry':
                    repair_hint = {'step': request['step'], 'error': result.get('error', 'Invalid action')}
                    continue
                if result['status'] != 'continue':
                    return {**result, 'modelCalls': model_calls, 'steps': steps_taken}
                if _failed(result.get('observation') or {}):
                    # Stop batch immediately on failure so the model can observe and adapt.
                    continue
                for extra_action in batch[1:]:
                    if steps_taken >= max_steps or (cancel_event and cancel_event.is_set()):
                        break
                    next_turn = self.agent.next(session_id)
                    step_payload = {
                        'sessionId': session_id,
                        'step': next_turn['step'],
                        'status': 'act',
                        'plan': parsed.get('plan', 'Continue batched step'),
                        'action': extra_action,
                    }
                    result = self.agent.submit(session_id, step_payload)
                    steps_taken += 1
                    self._emit(on_event, 'observe', sessionId=session_id, step=next_turn['step'], result=result)
                    if result['status'] != 'continue' or _failed(result.get('observation') or {}):
                        break
                continue

            # Handle model-callable sub-agent spawning (`spawn_agent`)
            if parsed.get('status') == 'act' and isinstance(parsed.get('action'), dict) and parsed['action'].get('tool') == 'spawn_agent':
                turn_info = self.agent.pending.pop(session_id, None)
                act_args = parsed['action'].get('args') if isinstance(parsed['action'].get('args'), dict) else {}
                sub_goal = str(act_args.get('goal') or '').strip()
                parent_s = self.runtime.get(session_id)
                call_id = f"{session_id}_{request['step']}"
                self.agent.dispatch({'op': 'event', 'session': session_id, 'value': {k: v for k, v in parsed.items() if k in {'sessionId', 'step', 'status', 'plan', 'action', 'tasks'}}})
                if self._subagent_depth >= 2 or not sub_goal:
                    obs = {'id': call_id, 'tool': 'spawn_agent', 'ok': False, 'error': 'Provide a nonempty goal (max subagent depth 2)'}
                else:
                    sub_edits = bool(act_args.get('allowEdits', False)) and bool(parent_s.get('allowEdits'))
                    sub_cmds = bool(act_args.get('allowCommands', False)) and bool(parent_s.get('allowCommands'))
                    sub_steps = act_args.get('maxSteps', 8)
                    sub_steps = max(1, min(15, sub_steps if isinstance(sub_steps, int) else 8))
                    cmds = tuple(sorted(set(self.runtime.allowed) - {'*'}))
                    with ReactAgent(self.runtime.root, commands=cmds, remember_sessions=False, _subagent_depth=self._subagent_depth + 1) as child:
                        sub_res = child.run(sub_goal, model, allow_edits=sub_edits, allow_commands=sub_cmds, max_steps=sub_steps, cancel_event=cancel_event)
                    obs = {'id': call_id, 'tool': 'spawn_agent', 'ok': sub_res.get('status') == 'complete', 'result': sub_res}
                self.runtime.event(parent_s, 'observation', obs)
                steps_taken += 1
                self._emit(on_event, 'observe', sessionId=session_id, step=request['step'], result={'status': 'continue', 'sessionId': session_id, 'observation': obs})
                continue

            # Standard single-action / ask / done turn
            self._emit_protocol(otel_observer, sink_fn, 'thought', sessionId=session_id, step=request['step'], value={'plan': parsed.get('plan', ''), 'stopReason': parsed.get('stopReason'), 'usage': parsed.get('usage')})
            if parsed.get('status') == 'act' and isinstance(parsed.get('action'), dict):
                self._emit_protocol(otel_observer, sink_fn, 'action', sessionId=session_id, step=request['step'], value={'id': f"step-{request['step']}", **parsed['action']})
            result = self.agent.submit(session_id, parsed)
            steps_taken += 1
            if result.get('observation') is not None:
                obs = result['observation']
                self._emit_protocol(otel_observer, sink_fn, 'observation', sessionId=session_id, step=request['step'], value={'id': obs.get('id') or f"step-{request['step']}", **obs})
            self._emit_protocol(otel_observer, sink_fn, 'step_end', sessionId=session_id, step=request['step'])
            self._emit(on_event, 'observe', sessionId=session_id, step=request['step'], result=result)
            if result['status'] == 'retry':
                repair_hint = {'step': request['step'], 'error': result.get('error') or result.get('reason', 'Rejected turn')}
                continue
            if result['status'] != 'continue':
                self._emit_protocol(otel_observer, sink_fn, 'done', sessionId=session_id, step=request['step'], value=result)
                return {**result, 'modelCalls': model_calls, 'steps': steps_taken}

        self.runtime.cancel(self.runtime.get(session_id))
        reason = 'step_budget' if steps_taken >= max_steps else 'model_budget'
        return {'status': 'paused', 'reason': reason, 'sessionId': session_id, 'modelCalls': model_calls, 'steps': steps_taken}

    def resume(self, session_id, model, *, answer='', **kwargs):
        return self.run('', model, session_id=session_id, answer=answer, **kwargs)
