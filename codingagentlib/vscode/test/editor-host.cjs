'use strict';
// Executed by VS Code itself, not node:test or a mocked VS Code API.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const {Worker} = require('../src/worker.cjs');
const {Controller} = require('../src/controller.cjs');
const EditorContext = require('../src/editor-context.cjs');

exports.run = async () => {
  const root = process.env.CODINGAGENT_HOST_TEST_ROOT;
  assert.equal(vscode.workspace.workspaceFolders[0].uri.fsPath, root);
  const extension = vscode.extensions.getExtension('bdug.rabbithole');
  assert.ok(extension, 'Development extension must be discoverable');
  await extension.activate();
  assert.ok(extension.isActive);
  const commands = await vscode.commands.getCommands(true);
  for (const command of ['open', 'attachFile', 'attachSelection', 'reviewChanges', 'stop']) {
    assert.ok(commands.includes('codingagent.' + command));
  }
  const uri = vscode.Uri.file(path.join(root, 'source.js'));
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(0, 0, 0, 6);
  const diagnostics = vscode.languages.createDiagnosticCollection('codingagent-host-test');
  diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 6), 'Host diagnostic marker', vscode.DiagnosticSeverity.Warning)]);
  let worker;
  try {
    const context = await EditorContext.collect(vscode, root, {limit: 10});
    assert.equal(context.activeEditor.path, 'source.js');
    assert.ok(context.diagnostics.some(d => d.message === 'Host diagnostic marker'));
    await vscode.commands.executeCommand('codingagent.open');
    await vscode.commands.executeCommand('codingagent.attachFile', uri);
    await vscode.commands.executeCommand('codingagent.attachSelection');
    await vscode.commands.executeCommand('codingagent.reviewChanges');
    // Run the production controller and bundled worker in this real extension host.
    // Run approval dialogs and provider quality are covered separately, not bypassed here.
    const runtime = path.join(root, 'runtime');
    await fs.mkdir(runtime);
    const binary = path.join(extension.extensionPath, 'bin/codingagent-worker' + (process.platform === 'win32' ? '.exe' : ''));
    const node = process.env.CODINGAGENT_TEST_NODE;
    worker = new Worker(binary, runtime, [node]);
    const script = "require('node:assert/strict').equal(require('node:fs').readFileSync('result.txt','utf8'),'verified host run')";
    const trace = [];
    const controller = new Controller(worker, async request => {
      const observations = request.events.filter(e => e.kind === 'observation').map(e => e.value);
      for (const observation of observations) assert.equal(observation.ok, true, JSON.stringify(observation));
      const action = observations.length === 0
        ? {tool: 'write_file', args: {path: 'result.txt', content: 'verified host run', expectedHash: 'missing'}}
        : observations.length === 1 ? {tool: 'run_command', args: {command: node, args: ['-e', script]}} : null;
      return {sessionId: request.sessionId, step: request.step, status: action ? 'act' : 'done',
        plan: 'Write and verify the host result', action, summary: 'Verified native execution inside VS Code'};
    }, event => trace.push(event));
    const result = await controller.run('Verify real extension host', {edits: true, commands: true}, 8, false, [],
      [{name: 'Host result', command: node, args: ['-e', script], cwd: '.'}]);
    assert.equal(result.status, 'complete', JSON.stringify(result));
    assert.equal(await fs.readFile(path.join(runtime, 'result.txt'), 'utf8'), 'verified host run');
    assert.ok(trace.some(e => e.kind === 'verification' && e.report.passed));
    const archive = await worker.call('package', {session_id: controller.session});
    assert.equal((await fs.readFile(archive.path)).subarray(0, 2).toString(), 'PK');
    await fs.writeFile(process.env.CODINGAGENT_HOST_TEST_RESULT, JSON.stringify({passed: true,
      vscode: vscode.version, platform: process.platform, arch: process.arch,
      checks: ['activation', 'commands', 'diagnostics', 'attachments', 'native-verification', 'zip-export']}));
    console.log('PASS actual VS Code host: activation, commands, editor selection/diagnostics, attachment commands, native verified execution and ZIP export.');
  } finally {
    diagnostics.dispose();
    await worker?.close();
    await vscode.commands.executeCommand('codingagent.stop');
  }
};
