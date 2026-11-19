'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {LocalRuntime} = require('./local.js');

(async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-command-resolution-'));
  const runtime = new LocalRuntime({workspace, python: '/obsolete/agent-install/python3', commands: ['python3']});
  try {
    await fs.writeFile(path.join(workspace, 'source.txt'), 'expected');
    let calls = 0;
    const result = await runtime.run({
      goal: 'Inspect source and verify it with a relocated interpreter', allowCommands: true,
      model: async request => {
        calls++;
        const observations = request.events.filter(e => e.kind === 'observation').map(e => e.value);
        let action;
        if (observations.length === 0) {
          action = {tool: 'read_file', args: {path: 'source.txt'}};
        } else if (observations.length === 1) {
          action = {tool: 'run_command', args: {command: '/missing/no-such-approved-command'}};
        } else if (observations.length === 2) {
          assert.equal(observations[1].ok, false);
          assert.match(observations[1].error, /allowlist/);
          action = {tool: 'run_command', args: {
            command: '/obsolete/agent-install/python3',
            args: ['-c', "from pathlib import Path; assert Path('source.txt').read_text() == 'expected'; print('verified')"]
          }};
        } else {
          assert.equal(observations[2].ok, true);
          assert.equal(observations[2].result.exitCode, 0);
          assert.equal(observations[2].result.stdout.trim(), 'verified');
          assert.ok(path.isAbsolute(observations[2].result.resolvedExecutable));
        }
        return JSON.stringify({sessionId: request.sessionId, step: request.step,
          status: action ? 'act' : 'done', plan: 'Inspect observations and correct the executable',
          action: action || null, summary: 'Verified source with the resolved interpreter'});
      }
    });
    assert.equal(result.status, 'complete');
    assert.equal(calls, 4);
    console.log('PASS JavaScript request-response loop: failed resolution observation, corrected stale path, actual execution and verified completion.');
  } finally {
    await runtime.close();
    await fs.rm(workspace, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
