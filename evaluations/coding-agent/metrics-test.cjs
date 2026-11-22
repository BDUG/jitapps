'use strict';
const assert = require('node:assert/strict');
const {summarize} = require('./metrics.cjs');
const trial = (succeeded, outcome = 'complete') => ({caseId: 'repair', succeeded, outcome,
  integrity: [{unchanged: true}], durationMs: 100, modelRequests: 2, toolCalls: 1, tokenUsage: []});
const perfect = summarize([trial(true), trial(true), trial(true)]);
assert.equal(perfect.controlledPilotPolicy.qualified, true);
assert.ok(perfect.confidence95.lower < 0.5, 'Three successes cannot establish a narrow reliability bound');
assert.equal(summarize([trial(true)]).controlledPilotPolicy.qualified, false);
assert.equal(summarize([trial(true), trial(true), trial(true)], {complete: false}).controlledPilotPolicy.qualified, false);
const bad = summarize([...Array.from({length: 19}, () => trial(true)), trial(false)]);
assert.equal(bad.observedSuccessRate, 0.95);
assert.equal(bad.falseComplete, 1);
assert.equal(bad.controlledPilotPolicy.qualified, false, 'High success rate cannot hide false completion');
const corrupt = trial(true); corrupt.integrity[0].unchanged = false;
assert.equal(summarize([trial(true), trial(true), corrupt]).controlledPilotPolicy.qualified, false);
assert.equal(summarize([trial(false, 'failed')]).falseComplete, 0);
console.log('PASS reliability scoring: small-sample uncertainty, minimum trials, false completion, integrity and incomplete-report gates.');
