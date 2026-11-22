'use strict';
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}
function wilson(passed, total) {
  if (!total) return null;
  const z = 1.959963984540054, p = passed / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return {level: 0.95, method: 'Wilson score', lower: Math.max(0, center - margin), upper: Math.min(1, center + margin)};
}
function summarize(results, {complete = true, minimumTrials = 3} = {}) {
  const passed = results.filter(r => r.succeeded).length;
  const falseComplete = results.filter(r => !r.succeeded && r.outcome === 'complete').length;
  const integrityViolations = results.filter(r => r.integrity.some(item => !item.unchanged)).length;
  const byCase = {};
  for (const id of new Set(results.map(r => r.caseId))) {
    const trials = results.filter(r => r.caseId === id), successes = trials.filter(r => r.succeeded).length;
    byCase[id] = {trials: trials.length, passed: successes, successRate: successes / trials.length,
      confidence95: wilson(successes, trials.length), falseComplete: trials.filter(r => !r.succeeded && r.outcome === 'complete').length};
  }
  const usage = results.flatMap(r => r.tokenUsage || []);
  const sumKnown = key => usage.filter(u => Number.isFinite(u.usage?.[key])).reduce((n, u) => n + u.usage[key], 0);
  const enoughTrials = Object.keys(byCase).length > 0 && Object.values(byCase).every(r => r.trials >= minimumTrials);
  const observedSuccessRate = results.length ? passed / results.length : 0;
  return {trials: results.length, passed, observedSuccessRate, confidence95: wilson(passed, results.length),
    falseComplete, integrityViolations, byCase,
    latencyMs: {median: percentile(results.map(r => r.durationMs), 0.5), p95: percentile(results.map(r => r.durationMs), 0.95)},
    modelRequests: results.reduce((n, r) => n + r.modelRequests, 0), toolCalls: results.reduce((n, r) => n + r.toolCalls, 0),
    tokenUsage: {callsWithUsage: usage.filter(u => u.usage).length, callsWithoutUsage: usage.filter(u => !u.usage).length,
      reportedInputTokens: sumKnown('inputTokens'), reportedOutputTokens: sumKnown('outputTokens')},
    costUsd: null,
    controlledPilotPolicy: {minimumTrialsPerCase: minimumTrials, minimumObservedSuccessRate: 0.9,
      maximumFalseComplete: 0, maximumIntegrityViolations: 0,
      qualified: complete && enoughTrials && observedSuccessRate >= 0.9 && falseComplete === 0 && integrityViolations === 0,
      note: 'Observed fixture results with uncertainty, not a general coding-ability or production-reliability guarantee.'}};
}
module.exports = {summarize};
