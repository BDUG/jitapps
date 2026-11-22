'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const suite = require('./cases.json');

// Reference repairs only validate the benchmark's checkers. They are not model output.
const solutions = {
  'python-concurrent-edit': {'counter.py': 'def add(a, b):\n    return a + b\n# concurrent user note: preserve me\n'},
  'python-restart-recovery': {'labels.py': `def unique_labels(values):
    seen = set()
    result = []
    for value in values:
        if not isinstance(value, str):
            raise ValueError(value)
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
`},
  'python-add': {'maths.py': 'def add(a, b):\n    return a + b\n'},
  'javascript-label': {'src/labels.js': 'exports.formatLabel = value => value.trim().toUpperCase();\n'},
  'python-validation': {'values.py': `def positive_count(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError(value)
    if isinstance(value, str) and not value.strip().isdecimal():
        raise ValueError(value)
    result = int(value)
    if result <= 0:
        raise ValueError(value)
    return result
`},
  'python-csv-totals': {
    'orders.py': `import csv
import io

def read_orders(text):
    reader = csv.DictReader(io.StringIO(text, newline=""))
    if reader.fieldnames is None or len(reader.fieldnames) != 3 or set(reader.fieldnames) != {"customer", "amount", "status"}:
        raise ValueError("Invalid headers")
    rows = []
    for row in reader:
        if None in row or any(value is None for value in row.values()) or not row["customer"].strip():
            raise ValueError("Invalid row")
        rows.append(row)
    return rows
`,
    'summary.py': `from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN
from orders import read_orders

def totals(text):
    result = {}
    for row in read_orders(text):
        if row["status"] != "paid":
            continue
        try:
            amount = Decimal(row["amount"])
            if not amount.is_finite():
                raise ValueError("Nonfinite amount")
            result[row["customer"]] = result.get(row["customer"], Decimal(0)) + amount
        except InvalidOperation as error:
            raise ValueError("Invalid amount") from error
    return {key: str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)) for key, value in result.items()}
`,
  },
  'javascript-paged-catalog': {
    'src/catalog.js': suite.cases.find(c => c.id === 'javascript-paged-catalog').files['src/catalog.js'].split('exports.normalizeTag')[0]
      + 'exports.normalizeTag = value => String(value ?? "").trim().toLowerCase();\n',
    'src/search.js': `const {normalizeTag} = require('./catalog');
exports.findItems = (items, query, {offset=0,limit=25}={}) => {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid page');
  const normalized = normalizeTag(query);
  const matches = items.filter(item => normalizeTag(item.label).includes(normalized));
  const page = matches.slice(offset, offset + limit);
  const next = offset + page.length;
  return {items: page, total: matches.length, nextOffset: next < matches.length ? next : null};
};
`,
  },
};

function check(argv, workspace) {
  const executable = argv[0] === 'python' ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath;
  const result = spawnSync(executable, argv.slice(1), {cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
  if (result.error) throw result.error;
  return {passed: result.status === 0, output: result.stderr + result.stdout};
}

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-fixture-checks-'));
  try {
    assert.equal(new Set(suite.cases.map(c => c.id)).size, suite.cases.length);
    for (const fixture of suite.cases) {
      const workspace = path.join(root, fixture.id);
      for (const [name, text] of Object.entries(fixture.files)) {
        const file = path.join(workspace, name);
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, text);
      }
      assert.equal(check(fixture.publicCommand, workspace).passed, false, fixture.id + ' must expose a failing baseline');
      assert.ok(fixture.checks.some(c => !check(c.command, workspace).passed), fixture.id + ' held-out checks must reject the original');
      // A one-file repair must not accidentally pass the new multi-file cases.
      const repairs = Object.entries(solutions[fixture.id]);
      for (const [index, [name, text]] of repairs.entries()) {
        assert.ok(fixture.mutable.includes(name));
        await fs.writeFile(path.join(workspace, name), text);
        if (repairs.length > 1 && index === 0) {
          assert.ok(fixture.checks.some(c => !check(c.command, workspace).passed), fixture.id + ' must reject a partial repair');
        }
      }
      assert.equal(check(fixture.publicCommand, workspace).passed, true, fixture.id);
      for (const command of fixture.checks) {
        const result = check(command.command, workspace);
        assert.equal(result.passed, true, fixture.id + ': ' + result.output);
      }
      for (const [name, text] of Object.entries(fixture.files)) {
        if (!fixture.mutable.includes(name)) assert.equal(await fs.readFile(path.join(workspace, name), 'utf8'), text);
      }
      console.log('PASS evaluation fixture: ' + fixture.id + ' failing baseline, held-out checks and reference repair');
    }
  } finally { await fs.rm(root, {recursive: true, force: true}); }
}

module.exports = {solutions};
if (require.main === module) run().catch(error => {console.error(error); process.exitCode = 1;});
