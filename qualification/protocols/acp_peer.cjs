'use strict';
const readline = require('node:readline');
const {ACPServer} = require('../../codingagentlib/javascript/streaming.js');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const server = new ACPServer({emitNotification: send, promptHandler: async (id, params, service) => {
  const text = params.prompt.filter(p => p.type === 'text').map(p => p.text).join('\n');
  service.emitUpdate(id, {sessionUpdate: 'agent_message_chunk', content: {type: 'text', text: 'peer: ' + text}});
  if (text === 'wait for cancellation') {
    const until = Date.now() + 5000;
    while (!service.sessions.get(id).cancelled && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  }
  return {stopReason: 'end_turn'};
}});
readline.createInterface({input: process.stdin}).on('line', async line => {
  const frame = JSON.parse(line), response = await server.handle(frame);
  if (Object.hasOwn(frame, 'id')) send(response);
});
