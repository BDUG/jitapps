'use strict';
const path = require('node:path');
const {run} = require('../test/installed-ui.cjs');
function option(name, fallback) {const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1];}
run({executable: process.env.VSCODE_EXECUTABLE, cli: process.env.VSCODE_CLI,
  vsix: path.resolve(option('--vsix', process.env.VSCODE_VSIX || 'rabbithole-linux-x64-0.30.0.vsix')),
  report: path.resolve(option('--report', '/tmp/installed-vsix-report.json')),
  keep: process.argv.includes('--keep')}).catch(error => {console.error(error); process.exitCode = 1;});
