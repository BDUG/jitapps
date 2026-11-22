#!/usr/bin/env node
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn, spawnSync} = require('node:child_process');
const {options} = require('./run.cjs');
const root = path.resolve(__dirname, '../..');

function argument(name, fallback) {const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1];}
function bounded(value, min, max, name) {if (!Number.isSafeInteger(value) || value < min || value > max) throw Error('Invalid ' + name); return value;}
async function sourceSnapshot(destination) {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: root, encoding: 'utf8', maxBuffer: 16000000});
  if (result.status !== 0) throw Error('Cannot inventory source snapshot');
  const digest = crypto.createHash('sha256'); let files = 0;
  for (const name of [...new Set(result.stdout.split('\0').filter(Boolean))].sort()) {
    const source = path.join(root, name), stat = await fs.lstat(source).catch(() => null);
    if (!stat?.isFile()) continue;
    const content = await fs.readFile(source); digest.update(name + '\0').update(content).update('\0');
    const target = path.join(destination, name); await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, content, {mode: stat.mode & 0o111 ? 0o755 : 0o644}); files++;
  }
  return {sha256: digest.digest('hex'), files};
}
async function startRelay(config, folder) {
  const child = spawn(config.python, ['-u', 'server/server.py', '--port', '0', '--config', config.providerConfig,
    '--search-config', path.join(folder, 'search.json'), '--server-config', path.join(folder, 'server.json'),
    '--skills-db', path.join(folder, 'skills.sqlite'), '--projects-root', path.join(folder, 'projects'),
    '--disable-agent', '--skills-offline'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  let log = '';
  child.stderr.on('data', data => {log = (log + data).slice(-4000);});
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {child.kill(); reject(Error('Private relay startup timed out'));}, 20000);
    let output = '';
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('exit', code => {clearTimeout(timer); reject(Error('Private relay exited ' + code));});
    child.stdout.on('data', data => {output += data; const match = output.match(/listening on (\S+)/);
      if (match) {clearTimeout(timer); resolve('http://' + match[1]);}});
  });
  return {base, async close() {if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000); await exit; clearTimeout(timer);}};
}

async function main() {
  const config = options(process.argv.slice(2));
  if (!config.live) throw Error('Use --live to authorize bounded provider trials');
  const image = argument('--image', process.env.TLAL_EVALUATION_IMAGE);
  if (!/^(?:sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})$/.test(image || '')) throw Error('Provide a digest-pinned --image');
  const suiteSeconds = bounded(Number(argument('--suite-seconds', '1800')), 30, 7200, 'suite deadline');
  const maxRequests = bounded(Number(argument('--max-requests', '1200')), 1, 5000, 'provider request ceiling');
  const provider = JSON.parse(await fs.readFile(config.providerConfig, 'utf8'));
  const profile = provider.profiles.find(p => p.id === provider.activeProfileId);
  if (!profile?.model) throw Error('No active provider model configured');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tlal-isolated-eval-'));
  const work = path.join(temporary, 'work'), source = path.join(temporary, 'source'), sockets = path.join(temporary, 'relay');
  const name = 'tlal-evaluation-' + crypto.randomBytes(12).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  let relay, proxy, child, timer, requests = 0, timedOut = false;
  try {
    await Promise.all([work, source, sockets].map(p => fs.mkdir(p, {mode: 0o755})));
    const snapshot = await sourceSnapshot(source);
    const uid = process.getuid?.() || 65534, gid = process.getgid?.() || 65534;
    await fs.writeFile(path.join(work, 'settings.json'), JSON.stringify({proxyToken: token, model: profile.model,
      label: config.label === 'active relay provider' ? profile.provider + '/' + profile.model : config.label,
      repeat: config.repeat, maxSteps: config.maxSteps, timeout: config.timeout, caseId: config.caseId, review: config.review}), {mode: 0o644});
    if (process.getuid?.() === 0) await fs.chown(work, uid, gid);
    relay = await startRelay(config, temporary);
    proxy = http.createServer(async (request, response) => {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions' || request.headers.authorization !== 'Bearer ' + token) {
        response.writeHead(403); response.end('{"error":{"message":"Denied"}}'); return;
      }
      if (++requests > maxRequests) {response.writeHead(429); response.end('{"error":{"message":"Qualification request ceiling reached"}}'); return;}
      try {
        let raw = ''; for await (const chunk of request) {raw += chunk; if (Buffer.byteLength(raw) > 4000000) throw Error('Request exceeds qualification budget');}
        const body = JSON.parse(raw);
        const upstream = await fetch(relay.base + '/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json',
          'X-Architex-Request': '1', Origin: relay.base}, body: JSON.stringify({messages: body.messages, app: 'codeiX'}), signal: AbortSignal.timeout(180000)});
        const value = await upstream.json();
        if (!upstream.ok) {response.writeHead(upstream.status); response.end(JSON.stringify({error: {message: 'Configured provider request failed'}})); return;}
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({choices: [{message: {role: 'assistant', content: value.text}, finish_reason: 'stop'}], usage: value.usage}));
      } catch {response.writeHead(502); response.end('{"error":{"message":"Qualification relay failure"}}');}
    });
    const socket = path.join(sockets, 'provider.sock');
    await new Promise(resolve => proxy.listen(socket, resolve)); await fs.chmod(socket, 0o666);
    const args = ['run', '--pull=never', '--rm', '--name', name, '--user', uid + ':' + gid,
      '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
      '--pids-limit', '256', '--memory', '1024m', '--memory-swap', '1024m', '--cpus', '2',
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777',
      '--mount', 'type=bind,src=' + source + ',dst=/suite,readonly',
      '--mount', 'type=bind,src=' + work + ',dst=/work',
      '--mount', 'type=bind,src=' + sockets + ',dst=/relay,readonly',
      '--entrypoint', '/usr/bin/timeout', image, '--signal=KILL', suiteSeconds + 's',
      'node', '/suite/evaluations/coding-agent/container-entry.cjs'];
    child = spawn('docker', args, {stdio: 'inherit'});
    timer = setTimeout(() => {timedOut = true; spawnSync('docker', ['rm', '-f', name], {stdio: 'ignore', timeout: 10000});}, (suiteSeconds + 15) * 1000);
    const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);});
    clearTimeout(timer);
    const report = JSON.parse(await fs.readFile(path.join(work, 'report.json'), 'utf8'));
    if (report.mode !== 'live' || report.format !== 'suite-agent-evaluation/v1') throw Error('Missing live evaluation evidence');
    report.isolation = {image, source: snapshot, network: 'none; bounded host relay over mounted Unix socket',
      nonRootUid: uid, memoryMb: 1024, cpus: 2, pids: 256, suiteSeconds, maxRequests, providerRequests: requests,
      providerCredentialsInContainer: false, hostDockerSocketMounted: false, timedOut};
    const publicProfile = Object.fromEntries(['provider','model','protocol','endpoint','temperature','tokenLimitEnabled','maxTokens']
      .filter(key => profile[key] !== undefined).map(key => [key, profile[key]]));
    report.actualProvider = {...publicProfile, configurationSha256: crypto.createHash('sha256').update(JSON.stringify(publicProfile)).digest('hex')};
    report.implementation = {...report.implementation,
      commit: spawnSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).stdout?.trim() || null,
      dirty: !!spawnSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).stdout?.trim(), sourceSha256: snapshot.sha256};
    await fs.mkdir(path.dirname(path.resolve(config.report)), {recursive: true});
    await fs.writeFile(config.report, JSON.stringify(report, null, 2) + '\n');
    console.log('Isolated live report: ' + config.report);
    if (code !== 0 || timedOut || report.passed !== report.total) process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    if (child?.exitCode === null) spawnSync('docker', ['rm', '-f', name], {stdio: 'ignore', timeout: 10000});
    proxy?.closeAllConnections(); if (proxy) await new Promise(resolve => proxy.close(resolve));
    await relay?.close();
    await fs.rm(temporary, {recursive: true, force: true});
  }
}

main().catch(error => {console.error(error.message); process.exitCode = 1;});
