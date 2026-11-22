'use strict';
// Optional real installed-VSIX test. Playwright drives a disposable Electron
// window, including real custom approval dialogs; no VS Code API is mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

async function waitFor(check, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {const value = await check(); if (value) return value; await new Promise(r => setTimeout(r, 100));}
  throw Error(message);
}
async function panel(page) {
  return waitFor(async () => {
    for (const frame of page.frames()) {try {if (await frame.locator('#goal').count()) return frame;} catch {}}
  }, 'RabbitHole webview did not open');
}
async function command(page, title) {
  await page.bringToFront();
  const shortcut = page.getByText('Show All Commands', {exact: true});
  if (await shortcut.count()) await shortcut.click();
  else await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
  const input = page.locator('.quick-input-widget input').first();
  await input.fill('>' + title); await page.keyboard.press('Enter');
}
async function approval(page, accept) {
  const button = page.getByRole('button', {name: accept ? 'Start run' : 'Cancel', exact: true});
  await button.waitFor({state: 'visible'}); await button.click();
}
async function status(frame, expected) {
  await waitFor(async () => (await frame.locator('#status').textContent()).includes(expected), 'Missing status ' + expected);
  await waitFor(async () => !(await frame.locator('#start').isDisabled()), 'Run did not finish preparing');
  assert.ok((await frame.locator('#status').textContent()).includes(expected), 'Final status differs from ' + expected);
}

exports.run = async config => {
  if (!config.executable || !config.cli) throw Error('Set VSCODE_EXECUTABLE (Electron) and VSCODE_CLI (code launcher).');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'installed-rabbithole-'));
  const workspace = path.join(temporary, 'workspace'), profile = path.join(temporary, 'profile'), extensions = path.join(temporary, 'extensions');
  const checks = []; let calls = 0, child, browser, page, server, processLog = '';
  const script = "require('node:assert/strict').equal(require('./source.js').add(2,3),5)";
  const environment = {...process.env}; delete environment.ELECTRON_RUN_AS_NODE; delete environment.VSCODE_IPC_HOOK_CLI;
  const record = name => {checks.push({name, passed: true}); console.log('PASS installed VSIX: ' + name);};
  const stopEditor = async () => {
    await browser?.close().catch(() => {}); browser = null;
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000); await exit; clearTimeout(timer);
    }
  };
  const startEditor = async () => {
    child = spawn(config.executable, ['--new-window', '--no-sandbox', '--disable-gpu', '--skip-welcome', '--skip-release-notes',
      '--disable-workspace-trust', '--disable-updates', '--disable-telemetry', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, '--extensions-dir=' + extensions, workspace], {env: environment, stdio: ['ignore', 'pipe', 'pipe']});
    let socket;
    const capture = data => {processLog = (processLog + data).slice(-20000); const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) socket = match[1];};
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    await waitFor(() => socket, 'Editor did not expose its test-only debugging endpoint');
    browser = await chromium.connectOverCDP(socket);
    page = await waitFor(() => browser.contexts()[0]?.pages().find(p => /workbench/.test(p.url())), 'Editor workbench missing');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.monaco-workbench').waitFor({state: 'visible'});
    await command(page, 'RabbitHole: Open Chat');
    return panel(page);
  };
  let result;
  try {
    await fs.mkdir(workspace); await fs.mkdir(path.join(profile, 'User'), {recursive: true});
    await fs.writeFile(path.join(workspace, 'source.js'), 'exports.add = (a,b) => a-b;\n');
    await fs.writeFile(path.join(workspace, 'reference.txt'), 'A'.repeat(12000) + 'B'.repeat(12000) + 'C'.repeat(12000));
    server = http.createServer(async (request, response) => {
      try {
        let raw = ''; for await (const chunk of request) raw += chunk;
        const body = JSON.parse(raw), content = body.messages.at(-1).content;
        const r = JSON.parse(typeof content === 'string' ? content : content.find(p => p.type === 'text').text);
        calls++;
        const observed = tool => r.events.filter(e => e.kind === 'observation' && e.value.tool === tool && e.value.ok).at(-1)?.value.result;
        let action = null, state = 'done', question;
        if (r.goal.includes('Plan must reject writes')) action = {tool: 'write_file', args: {path: 'forbidden.txt', content: 'bad', expectedHash: 'missing'}};
        else if (r.goal.includes('Reference page')) {
          const references = r.events.filter(e => e.kind === 'user').flatMap(e => e.value.attachments || []);
          assert.ok(references.some(f => f.page === 1 && f.content === 'B'.repeat(12000)));
        } else if (r.goal.includes('Repair addition')) {
          if (!observed('read_file')) action = {tool: 'read_file', args: {path: 'source.js'}};
          else if (!observed('replace_text')) action = {tool: 'replace_text', args: {path: 'source.js', find: 'a-b', replacement: 'a+b', expectedHash: observed('read_file').hash}};
          else if (!observed('run_command')) action = {tool: 'run_command', args: {command: process.execPath, args: ['-e', script]}};
        } else if (r.goal.includes('Cancellable command')) action = {tool: 'run_command', args: {command: process.execPath, args: ['-e', "require('fs').writeFileSync('command-started.txt','started');setTimeout(()=>{},60000)"], timeout: 120000}};
        else if (r.goal.includes('Restart and resume')) {
          if (!observed('write_file')) action = {tool: 'write_file', args: {path: 'resumed.txt', content: 'persisted before restart', expectedHash: 'missing'}};
          else if (!r.events.some(e => e.kind === 'user' && e.value.status === 'follow_up')) {state = 'ask'; question = 'Continue verification after restart?';}
          else if (!observed('run_command')) action = {tool: 'run_command', args: {command: process.execPath, args: ['-e', script]}};
        }
        if (action) state = 'act';
        const value = {sessionId: r.sessionId, step: r.step, status: state, plan: 'Installed package workflow qualification', action, summary: 'Observed installed workflow', ...(question ? {question} : {})};
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({choices: [{message: {role: 'assistant', content: JSON.stringify(value)}, finish_reason: 'stop'}], usage: {prompt_tokens: 10, completion_tokens: 5}}));
      } catch (error) {response.writeHead(500); response.end(JSON.stringify({error: {message: error.message}}));}
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const settings = {'window.dialogStyle': 'custom', 'files.simpleDialog.enable': true, 'workbench.startupEditor': 'none',
      'extensions.autoUpdate': false, 'chat.disableAIFeatures': true, 'security.workspace.trust.enabled': false,
      'codingagent.endpoint': 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions', 'codingagent.model': 'installed-fixture',
      'codingagent.allowedCommands': [process.execPath], 'codingagent.maxSteps': 12,
      'codingagent.verificationCommands': [{name: 'Addition', command: process.execPath, args: ['-e', script], cwd: '.'}]};
    await fs.writeFile(path.join(profile, 'User/settings.json'), JSON.stringify(settings));
    const installed = spawnSync(config.cli, ['--user-data-dir=' + profile, '--extensions-dir=' + extensions, '--install-extension', config.vsix, '--force'],
      {env: environment, encoding: 'utf8', timeout: 60000});
    assert.equal(installed.status, 0, installed.stderr + installed.stdout);
    record('exact VSIX installed into a disposable profile');
    let frame = await startEditor();
    await frame.locator('#goal').fill('Denied write'); await frame.locator('#edits').check(); await frame.locator('#start').click();
    await approval(page, false); await waitFor(async () => !(await frame.locator('#start').isDisabled()), 'Denied run stayed busy');
    assert.equal(calls, 0); await assert.rejects(fs.access(path.join(workspace, 'forbidden.txt')));
    record('denied run sends no provider request and makes no edit');
    await frame.locator('#goal').fill('/plan Plan must reject writes'); await frame.locator('#start').click(); await approval(page, true);
    await status(frame, 'plan_action_blocked'); await assert.rejects(fs.access(path.join(workspace, 'forbidden.txt')));
    record('Plan blocks a model-proposed write in the installed package');
    await frame.locator('#goal').fill('/plan Reference page @file:reference.txt#page=2'); await frame.locator('#start').click(); await approval(page, true); await status(frame, 'complete');
    record('composer page reference reaches the actual provider request intact');
    await frame.locator('#execution-mode').selectOption('build'); await frame.locator('#edits').check(); await frame.locator('#commands').check();
    await frame.locator('#goal').fill('/build Repair addition'); await frame.locator('#start').click(); await approval(page, true); await status(frame, 'complete');
    assert.match(await fs.readFile(path.join(workspace, 'source.js'), 'utf8'), /a\+b/);
    record('approved Build edits source and satisfies actual configured verification');
    // Additional lifecycle scenarios use the same installed artifact/profile.
    await frame.locator('#goal').fill('/build Cancellable command'); await frame.locator('#start').click(); await approval(page, true);
    await waitFor(async () => !(await frame.locator('#stop').isDisabled()), 'Cancellable run did not start');
    await waitFor(() => fs.access(path.join(workspace, 'command-started.txt')).then(() => true, () => false), 'Native command never actually started');
    const cancelStarted = Date.now(); await frame.locator('#stop').click(); await status(frame, 'cancelled');
    assert.ok(Date.now() - cancelStarted < 5000, 'Cancellation did not interrupt the native command promptly');
    record('Stop cancels an installed native command');
    await frame.locator('#goal').fill('/build Restart and resume'); await frame.locator('#start').click(); await approval(page, true); await status(frame, 'waiting');
    assert.equal(await fs.readFile(path.join(workspace, 'resumed.txt'), 'utf8'), 'persisted before restart');
    await stopEditor(); frame = await startEditor();
    await frame.locator('[data-command="sessions"]').click();
    const pick = page.locator('.quick-input-widget input').first(); await pick.fill('Restart and resume'); await page.keyboard.press('Enter');
    await frame.locator('#goal').fill('Proceed with verification'); await frame.locator('#resume').click(); await approval(page, true); await status(frame, 'complete');
    assert.equal(await fs.readFile(path.join(workspace, 'resumed.txt'), 'utf8'), 'persisted before restart');
    record('editor restart restores a paused edited session and resumes verification');
    await frame.locator('#agent-tools > summary').click();
    await frame.locator('[data-command="package"]').click();
    const save = page.locator('.quick-input-widget input').first();
    await save.fill(path.join(workspace, 'result.zip')); await page.keyboard.press('Enter');
    await waitFor(() => fs.access(path.join(workspace, 'result.zip')).then(() => true, () => false), 'ZIP save did not complete');
    const archiveCheck = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c',
      "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert any(z.read(n)==b'persisted before restart' for n in z.namelist() if not n.endswith('/'))", path.join(workspace, 'result.zip')], {encoding: 'utf8'});
    assert.equal(archiveCheck.status, 0, archiveCheck.stderr);
    record('actual Save dialog exports a ZIP containing the retained edited artifact');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P');
    const openFile = page.locator('.quick-input-widget input').first(); await openFile.fill('source.js'); await page.keyboard.press('Enter');
    await page.locator('.monaco-editor').first().waitFor({state: 'visible'});
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
    await page.keyboard.type('// dirty editor marker\n');
    const diskBefore = await fs.readFile(path.join(workspace, 'source.js'), 'utf8');
    assert.ok(!diskBefore.includes('dirty editor marker'));
    await command(page, 'RabbitHole: Open Chat'); frame = await panel(page);
    const beforeDirtyRun = calls;
    await frame.locator('#goal').fill('/plan Dirty file check'); await frame.locator('#start').click();
    await page.getByRole('button', {name: 'Cancel', exact: true}).click();
    await waitFor(async () => !(await frame.locator('#start').isDisabled()), 'Dirty-file denial remained busy');
    assert.equal(calls, beforeDirtyRun);
    assert.equal(await fs.readFile(path.join(workspace, 'source.js'), 'utf8'), diskBefore);
    record('dirty-buffer denial preserves unsaved work and sends no model request');
    await frame.locator('#start').click(); await page.getByRole('button', {name: 'Save all', exact: true}).click();
    await approval(page, true); await status(frame, 'complete');
    assert.match(await fs.readFile(path.join(workspace, 'source.js'), 'utf8'), /dirty editor marker/);
    record('explicit Save all resolves dirty buffers before run approval and inspection');
    result = {format: 'installed-vsix-qualification/v1', passed: true, createdAt: new Date().toISOString(), platform: process.platform,
      arch: process.arch, editorVersion: spawnSync(config.cli, ['--version'], {env: environment, encoding: 'utf8'}).stdout.trim().split('\n')[0], artifact: {path: config.vsix, sha256: crypto.createHash('sha256').update(await fs.readFile(config.vsix)).digest('hex')}, checks, modelCalls: calls,
      limitations: ['Deterministic provider; not a live-model quality score.', 'Only the recorded platform is qualified.']};
  } catch (error) {
    result = {format: 'installed-vsix-qualification/v1', passed: false, platform: process.platform, arch: process.arch, checks, error: error.message, workspace: temporary};
    if (page) await page.screenshot({path: path.join(temporary, 'failure.png')}).catch(() => {});
    if (page) await fs.writeFile(path.join(temporary, 'inputs.json'), JSON.stringify(await page.locator('input').evaluateAll(nodes => nodes.map(n => ({value:n.value,placeholder:n.placeholder,aria:n.getAttribute('aria-label')}))))).catch(() => {});
    await fs.writeFile(path.join(temporary, 'editor.log'), processLog);
    throw error;
  } finally {
    await stopEditor();
    if (server) {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
    if (result) {await fs.mkdir(path.dirname(config.report), {recursive: true}); await fs.writeFile(config.report, JSON.stringify(result, null, 2) + '\n');}
    if (!config.keep) await fs.rm(temporary, {recursive: true, force: true});
    else console.log('Installed test artifacts: ' + temporary);
  }
  return result;
};
