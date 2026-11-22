'use strict';
// Use an installed editor in a disposable profile; never install into the user's profile.
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const executable = process.env.VSCODE_EXECUTABLE;
  if (!executable) throw Error('Set VSCODE_EXECUTABLE to an installed VS Code Electron executable. A graphical display is required on Linux.');
  const root = path.resolve(__dirname, '..');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'codingagent-editor-host-'));
  try {
    const workspace = path.join(temporary, 'workspace');
    await fs.mkdir(workspace);
    await fs.writeFile(path.join(workspace, 'source.js'), 'module.exports = 1;\n');
    const args = ['--new-window', '--no-sandbox', '--disable-gpu', '--skip-welcome', '--skip-release-notes',
      '--disable-workspace-trust', '--disable-updates', '--disable-telemetry',
      '--user-data-dir=' + path.join(temporary, 'profile'), '--extensions-dir=' + path.join(temporary, 'extensions'),
      '--extensionDevelopmentPath=' + root, '--extensionTestsPath=' + path.join(root, 'test/editor-host.cjs'), workspace];
    const resultFile = path.join(temporary, 'result.json');
    const environment = {...process.env, CODINGAGENT_HOST_TEST_ROOT: workspace,
      CODINGAGENT_TEST_NODE: process.execPath, CODINGAGENT_HOST_TEST_RESULT: resultFile};
    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.VSCODE_IPC_HOOK_CLI;
    const child = spawn(executable, args, {stdio: 'inherit', env: environment});
    let timedOut = false;
    let force;
    const timer = setTimeout(() => {
      timedOut = true; child.kill('SIGTERM');
      force = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, 90000);
    let code;
    try { code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);}); }
    finally { clearTimeout(timer); clearTimeout(force); }
    if (timedOut || code !== 0) throw Error('VS Code extension-host check ' + (timedOut ? 'timed out' : 'exited ' + code));
    // Some editor CLIs return zero after launching. Require evidence from the test host.
    const result = JSON.parse(await fs.readFile(resultFile, 'utf8'));
    if (result.passed !== true) throw Error('Extension host did not confirm successful checks');
    console.log('Verified actual editor-host result: ' + JSON.stringify(result));
  } finally {
    await fs.rm(temporary, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
