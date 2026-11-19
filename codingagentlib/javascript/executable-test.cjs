'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {resolveExecutable} = require('./executable.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-executable-'));
try {
  const basename = path.basename(process.execPath);
  const env = {PATH: path.dirname(process.execPath), PATHEXT: '.EXE;.COM'};
  const expected = fs.realpathSync(process.execPath);
  assert.equal(resolveExecutable(process.execPath, env), expected);
  assert.equal(resolveExecutable(basename, env), expected);
  assert.equal(resolveExecutable(path.join(root, 'missing', basename), env), expected);
  assert.throws(() => resolveExecutable(path.join(root, 'no-such-executable-test'), env), {code:'ENOENT'});
  assert.throws(() => resolveExecutable('bad\0name', env), TypeError);
  const directory = path.join(root, basename);
  fs.mkdirSync(directory);
  assert.throws(() => resolveExecutable(directory, env), {code:'EACCES'});
  fs.rmdirSync(directory);
  if (process.platform !== 'win32') {
    fs.writeFileSync(directory, 'not executable', {mode:0o600});
    assert.throws(() => resolveExecutable(directory, env), {code:'EACCES'});
    const previous = process.cwd();
    try {
      const localName = 'agent-missing-path-test';
      fs.symlinkSync(process.execPath, path.join(root, localName));
      process.chdir(root);
      assert.throws(() => resolveExecutable(localName, {}), {code:'ENOENT'});
      assert.equal(resolveExecutable(localName, {PATH:''}), expected);
    } finally { process.chdir(previous); }
    const loop = path.join(root, 'loop');
    fs.symlinkSync(loop, loop);
    assert.equal(resolveExecutable(basename, {PATH:loop + path.delimiter + env.PATH}), expected);
  } else {
    const withoutExtension = basename.replace(/\.exe$/i, '');
    assert.equal(resolveExecutable(path.join(root, 'missing', withoutExtension), env), expected);
  }
  console.log('PASS executable resolution: explicit paths, PATH fallback, missing programs, invalid names and existing nonexecutable paths.');
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
