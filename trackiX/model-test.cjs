const assert = require('node:assert/strict');
const Trackix = require('./model.js');

const doc = Trackix.createDefault();
const validated = Trackix.validate(doc);
assert.equal(validated.kind, 'trackix-project');
assert.equal(validated.projectKey, 'TRK');
assert.equal(validated.issues.length, 4);

const m = Trackix.metrics(validated);
assert.equal(m.total, 4);
assert.equal(m.blocked, 1);

const csv = Trackix.toCsv(validated);
assert.ok(csv.includes('TRK-1'));
assert.ok(csv.includes('Sprint 14'));

assert.throws(() => Trackix.validate({ ...validated, projectKey: '1BAD' }), /Project key/);
assert.throws(
  () => Trackix.validate({ ...validated, issues: [validated.issues[0], validated.issues[0]] }),
  /Duplicate issue/
);

console.log('PASS: trackiX model validation, metrics, and CSV export.');
