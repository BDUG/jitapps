"""Optional decision model adapter for strategic guidance and action gating.

A decision model is an optional, host-supplied callable
``decision_model(decision_request) -> dict | str`` that advises or gates the
main coding model on each ReAct turn:

- ``off``     Do not consult a decision model.
- ``assist``  Consult before the main model and attach ``request['decision']``
              as advisory strategic guidance.
- ``gate``    Consult before the main model (assist) AND review the main
              model's proposed ``act`` / ``done`` response before execution.
"""
from __future__ import annotations

import json

DECISION_MODES = ('off', 'assist', 'gate')
PHASES = ('sense', 'plan', 'act', 'verify', 'adapt', 'ask', 'done')
RISKS = ('low', 'medium', 'high')


def resolve_mode(decision_model, mode='auto'):
    if mode in (None, 'auto'):
        return 'assist' if decision_model is not None else 'off'
    if mode not in DECISION_MODES:
        raise ValueError('decision_mode must be auto, off, assist or gate')
    if mode != 'off' and decision_model is None:
        raise ValueError('decision_model callable is required when decision_mode is %r' % mode)
    return mode


def build_decision_request(request, *, candidate=None):
    """Build a compact, bounded decision request from a planning turn."""
    events = request.get('events') or []
    observations = []
    for ev in reversed(events):
        if ev.get('kind') == 'observation' and not (ev.get('value') or {}).get('parentCallId'):
            v = ev['value']
            res = v.get('result') or {}
            observations.append({
                'id': v.get('id'),
                'tool': v.get('tool'),
                'ok': v.get('ok'),
                'exitCode': res.get('exitCode'),
                'error': str(v.get('error', ''))[:200] if v.get('error') else None,
            })
            if len(observations) >= 6:
                break
    observations.reverse()
    mem = request.get('agentMemory') or {}
    return {
        'format': 'codingagentlib/decision-request-v1',
        'sessionId': request.get('sessionId'),
        'step': request.get('step'),
        'goal': str(request.get('goal', ''))[:1000],
        'decisionGuidance': request.get('decisionGuidance'),
        'workingBrief': request.get('workingBrief'),
        'planning': request.get('planning'),
        'loopWarning': request.get('loopWarning'),
        'previousSessions': (mem.get('previousSessions') or [])[:5],
        'recalledMemoryCount': len(mem.get('items') or []),
        'recentObservations': observations,
        'availableTools': [t.get('name') for t in (request.get('tools') or []) if t.get('name')],
        **({'candidate': candidate} if candidate is not None else {}),
    }


def normalize_decision(raw):
    if isinstance(raw, str):
        text = raw.strip()
        if text.startswith('```'):
            lines = text.splitlines()
            if lines and lines[0].startswith('```'):
                lines = lines[1:]
            if lines and lines[-1].strip() == '```':
                lines = lines[:-1]
            text = '\n'.join(lines).strip()
        raw = json.loads(text)
    if not isinstance(raw, dict):
        raise ValueError('Decision model must return a JSON object')
    phase = raw.get('phase', 'plan')
    if phase not in PHASES:
        phase = 'plan'
    risk = raw.get('riskLevel', 'low')
    if risk not in RISKS:
        risk = 'low'
    confidence = raw.get('confidence', 0.7)
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        confidence = 0.7
    tools = raw.get('recommendedTools', [])
    if not isinstance(tools, list):
        tools = []
    return {
        'format': 'codingagentlib/decision-v1',
        'phase': phase,
        'strategy': str(raw.get('strategy', ''))[:600],
        'recommendedTools': [str(t) for t in tools[:8]],
        'riskLevel': risk,
        'confidence': round(float(confidence), 3),
        'approve': bool(raw.get('approve', True)),
        'stopRecommended': bool(raw.get('stopRecommended', False)),
        'rationale': str(raw.get('rationale', ''))[:800],
    }


def consult_decision_model(decision_model, request, *, candidate=None):
    payload = build_decision_request(request, candidate=candidate)
    return normalize_decision(decision_model(payload))
