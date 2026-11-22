#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const checks = [
  'shared-suite/inventory-fields-browser-test.cjs',
  'shared-suite/inventory-browser-test.cjs',
  'shared-suite/capabilities-browser-test.cjs',
  'shared-suite/recovery-browser-test.cjs',
  'shared-suite/project-zip-browser-test.cjs',
  'cncfiX/browser-test.cjs', 'graphiX/browser-test.cjs',
  'textiX/browser-test.cjs', 'sheetiX/browser-test.cjs',
];

async function verify() {
  // Fail before starting any processes when the browser dependency is unavailable.
  require.resolve('playwright');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'suite-app-readiness-'));
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const server = spawn(python, ['-u', 'server/server.py', '--port', '0', '--skills-offline', '--disable-agent',
    '--agent-workspace', folder, '--config', path.join(folder, 'providers.json'),
    '--search-config', path.join(folder, 'search.json'), '--skills-db', path.join(folder, 'skills.sqlite3')],
    {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  let errors = '';
  server.stderr.on('data', data => {errors = (errors + data).slice(-8000);});
  const startedAt = new Date().toISOString();
  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Server startup timeout: ' + errors)), 20000);
      let output = '';
      const fail = error => {clearTimeout(timeout); reject(error);};
      server.once('error', fail);
      server.once('exit', code => fail(Error('Server exited ' + code + ': ' + errors)));
      server.stdout.on('data', data => {
        output += data;
        const match = output.match(/listening on (\S+)/);
        if (match) {clearTimeout(timeout); resolve('http://' + match[1]);}
      });
    });
    const results = [];
    for (const file of checks) {
      const started = Date.now();
      const child = spawn(process.execPath, [file], {cwd: root, env: {...process.env, BASE_URL: base, SUITE_SKILLS_OFFLINE: '1'},
        stdio: ['ignore', 'pipe', 'pipe']});
      let log = '', timedOut = false, force;
      const capture = data => {log = (log + data).slice(-20000);};
      child.stdout.on('data', capture); child.stderr.on('data', capture);
      const timer = setTimeout(() => {
        timedOut = true; child.kill('SIGTERM');
        force = setTimeout(() => child.kill('SIGKILL'), 5000);
      }, 180000);
      let code;
      try { code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);}); }
      finally { clearTimeout(timer); clearTimeout(force); }
      const result = {file, passed: code === 0 && !timedOut, exitCode: code, timedOut, durationMs: Date.now() - started, output: log};
      results.push(result);
      console.log((result.passed ? 'PASS ' : 'FAIL ') + file);
      if (!result.passed) console.error(log);
    }
    const report = {startedAt, finishedAt: new Date().toISOString(), checks: results.length,
      failed: results.filter(r => !r.passed).length, results,
      limitations: ['Selected browser workflows, not every app feature or format.', 'No live model or external service qualification.']};
    const reportIndex = process.argv.indexOf('--report');
    if (reportIndex >= 0) {
      const name = process.argv[reportIndex + 1];
      if (!name || name.startsWith('--')) throw Error('Provide a path after --report');
      await fs.writeFile(path.resolve(name), JSON.stringify(report, null, 2) + '\n');
    }
    console.log(report.checks + ' browser workflows, ' + report.failed + ' failures.');
    if (report.failed) process.exitCode = 1;
  } finally {
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const closed = new Promise(resolve => server.once('exit', resolve));
      server.kill('SIGTERM');
      const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
      await closed; clearTimeout(timer);
    }
    await fs.rm(folder, {recursive: true, force: true});
  }
}

verify().catch(error => {console.error(error); process.exitCode = 1;});
