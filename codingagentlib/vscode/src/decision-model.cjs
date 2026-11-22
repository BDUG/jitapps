'use strict';

function resolveMode(decisionModel, mode = 'auto') {
  if (mode === 'auto') {
    return typeof decisionModel === 'function' ? 'assist' : 'off';
  }
  if (!['off', 'assist', 'gate'].includes(mode)) {
    throw Error('decisionMode must be auto, off, assist or gate');
  }
  if (mode !== 'off' && typeof decisionModel !== 'function') {
    throw Error('decisionModel callback is required when decisionMode is ' + mode);
  }
  return mode;
}

function buildDecisionRequest(request, candidate = null) {
  const availableTools = (request.tools || []).map((t) => (typeof t === 'string' ? t : t.name));
  const payload = {
    format: 'codingagentlib/decision-request-v1',
    sessionId: request.sessionId,
    step: request.step,
    goal: request.goal,
    availableTools,
    phase: candidate ? 'gate' : 'advise',
  };
  if (request.loopReview !== undefined) payload.loopReview = request.loopReview;
  if (request.verification !== undefined) payload.verification = request.verification;
  if (candidate) payload.candidate = candidate;
  return payload;
}

function normalizeDecision(raw) {
  let value = raw;
  if (typeof value === 'string') {
    let text = value.trim();
    if (text.startsWith('```')) {
      const lines = text.split('\n').slice(1);
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      text = lines.join('\n').trim();
    }
    value = JSON.parse(text);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Error('Decision model must return a JSON object');
  }
  return {
    approve: value.approve === undefined ? true : Boolean(value.approve),
    stopRecommended: Boolean(value.stopRecommended),
    strategy: typeof value.strategy === 'string' ? value.strategy.trim() : '',
    focus: typeof value.focus === 'string' ? value.focus.trim() : '',
    rationale: typeof value.rationale === 'string' ? value.rationale.trim() : '',
    risks: Array.isArray(value.risks)
      ? value.risks.filter((r) => typeof r === 'string').slice(0, 8)
      : [],
  };
}

async function consultDecisionModel(decisionModel, request, candidate = null, signal = undefined) {
  const payload = buildDecisionRequest(request, candidate);
  const raw = await decisionModel(payload, signal);
  return normalizeDecision(raw);
}

module.exports = {
  resolveMode,
  buildDecisionRequest,
  normalizeDecision,
  consultDecisionModel,
};
