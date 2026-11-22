'use strict';
// Trusted adapter inside a network-disabled container. Only a scoped, bounded
// host relay socket is mounted; real provider credentials never enter here.
const http = require('node:http');
const fs = require('node:fs/promises');
const {spawn} = require('node:child_process');

(async () => {
  const settings = JSON.parse(await fs.readFile('/work/settings.json', 'utf8'));
  const adapter = http.createServer((request, response) => {
    const upstream = http.request({socketPath: '/relay/provider.sock', path: '/v1/chat/completions',
      method: request.method, headers: request.headers}, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
    });
    upstream.on('error', () => {response.writeHead(502); response.end('{"error":{"message":"Qualification relay unavailable"}}');});
    request.pipe(upstream);
    response.on('close', () => upstream.destroy());
  });
  await new Promise(resolve => adapter.listen(0, '127.0.0.1', resolve));
  const config = {format: 'architex-relay-providers', version: 1, activeProfileId: 'qualification', allowedOrigins: [],
    profiles: [{id: 'qualification', name: 'Isolated qualification relay', provider: 'litellm', protocol: 'openai',
      endpoint: 'http://127.0.0.1:' + adapter.address().port + '/v1/chat/completions', model: settings.model,
      apiKey: settings.proxyToken, upstreamProvider: 'openai', tokenLimitEnabled: false, maxTokens: 4096, temperature: 0}]};
  await fs.writeFile('/work/providers.json', JSON.stringify(config), {mode: 0o600});
  const args = ['/suite/evaluations/coding-agent/run.cjs', '--live', '--provider-config', '/work/providers.json',
    '--report', '/work/report.json', '--label', settings.label, '--repeat', String(settings.repeat),
    '--max-steps', String(settings.maxSteps), '--timeout', String(settings.timeout),
    ...(settings.caseId ? ['--case', settings.caseId] : []), ...(settings.review ? ['--review'] : [])];
  const child = spawn(process.execPath, args, {stdio: 'inherit'});
  const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);});
  adapter.closeAllConnections();
  await new Promise(resolve => adapter.close(resolve));
  process.exitCode = code ?? 1;
})().catch(error => {console.error(error); process.exitCode = 1;});
