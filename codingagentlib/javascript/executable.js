'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Resolve before spawning. Never retry a process after it may have started.
function resolveExecutable(command, env = process.env) {
  if (typeof command !== 'string' || !command || command.includes('\0')) {
    throw new TypeError('Provide a nonempty executable name without NUL');
  }
  const windows = process.platform === 'win32';
  const variable = name => env[Object.keys(env).find(key => windows ? key.toUpperCase() === name : key === name)];
  const extensions = windows ? (variable('PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [];
  const candidates = file => [file, ...(!extensions.some(ext => file.toLowerCase().endsWith(ext.toLowerCase())) ? extensions.map(ext => file + ext) : [])];
  const explicit = command.includes(path.sep) || (windows && (command.includes('/') || path.isAbsolute(command)));
  const existing = file => {
    try { fs.statSync(file); return true; }
    catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false; throw error; }
  };
  const executable = file => {
    if (!fs.statSync(file).isFile()) return false;
    try { fs.accessSync(file, fs.constants.X_OK); return true; }
    catch (error) { if (error.code === 'EACCES') return false; throw error; }
  };
  if (explicit) {
    for (const file of candidates(command)) {
      if (!existing(file)) continue;
      if (executable(file)) return fs.realpathSync(file);
      throw Object.assign(new Error('Executable path is not executable: ' + command), {code: 'EACCES'});
    }
  }
  const basename = path.basename(command);
  // Match Node's spawn default when PATH is absent. An explicitly empty PATH
  // still means the current directory on POSIX; absent PATH must not mean that.
  const searchPath = variable('PATH') ?? (windows ? process.env.PATH || '' : '/usr/bin:/bin');
  for (const directory of searchPath.split(path.delimiter)) {
    for (const file of candidates(path.join(directory, basename))) {
      try {
        if (existing(file) && executable(file)) return fs.realpathSync(file);
      } catch (error) {
        // An inaccessible PATH entry or a file removed during lookup must not
        // prevent searching later entries. Explicit paths above retain errors.
        if (!['EACCES', 'ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error;
      }
    }
  }
  throw Object.assign(new Error('Executable not found after PATH search: ' + command), {code: 'ENOENT'});
}
module.exports = {resolveExecutable};
