import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Readable, Writable} from 'node:stream';
import fs from 'node:fs/promises';
import {client, ndJsonStream, PROTOCOL_VERSION} from '@agentclientprotocol/sdk';

const results = [];
for (const language of ['javascript', 'python']) {
  const child = spawn(language === 'javascript' ? process.execPath : process.env.QUALIFICATION_PYTHON || 'python3',
    language === 'javascript' ? ['qualification/protocols/acp_peer.cjs'] : ['-m', 'qualification.protocols.acp_peer'],
    {stdio: ['pipe', 'pipe', 'pipe']});
  let errors = ''; child.stderr.on('data', data => {errors += data;});
  const updates = [];
  const app = client({name: 'independent-qualification-client', version: '1.0.0'});
  app.onNotification('session/update', context => {updates.push(context.params);});
  try {
    await app.connectWith(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)), async context => {
      const initialized = await context.request('initialize', {protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}});
      assert.equal(initialized.protocolVersion, 1);
      const session = await context.request('session/new', {cwd: process.cwd(), mcpServers: []});
      const result = await context.request('session/prompt', {sessionId: session.sessionId, prompt: [{type: 'text', text: 'independent ACP message'}]});
      assert.equal(result.stopReason, 'end_turn');
      assert.ok(updates.some(u => u.update.content?.text === 'peer: independent ACP message'));
      await assert.rejects(context.request('session/prompt', {sessionId: 'missing', prompt: [{type: 'text', text: 'invalid'}]}));
      const pending = context.request('session/prompt', {sessionId: session.sessionId, prompt: [{type: 'text', text: 'wait for cancellation'}]});
      const until = Date.now() + 3000;
      while (!updates.some(u => u.update.content?.text === 'peer: wait for cancellation') && Date.now() < until) await new Promise(r => setTimeout(r, 10));
      await context.notify('session/cancel', {sessionId: session.sessionId});
      assert.equal((await pending).stopReason, 'cancelled');
      const after = await context.request('session/prompt', {sessionId: session.sessionId, prompt: [{type: 'text', text: 'new turn'}]});
      assert.equal(after.stopReason, 'end_turn', 'Cancellation must not poison later turns');
    });
    results.push({implementation: language, transport: 'stdio JSON-RPC', passed: true,
      checks: ['typed initialization/session/prompt', 'streaming updates', 'unknown session rejection', 'concurrent cancellation', 'new turn after cancellation']});
  } finally {
    child.stdin.end();
    if (child.exitCode === null) {const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit;}
  }
  assert.equal(errors, '');
}
const report = {format: 'independent-protocol-qualification/v1', protocol: 'ACP', wireVersion: 1,
  peer: {name: 'agentclientprotocol/typescript-sdk', version: '2.9.1'}, passed: true, results};
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
