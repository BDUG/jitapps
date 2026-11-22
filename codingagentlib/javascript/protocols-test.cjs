const assert = require('node:assert/strict');
const { a2a, streaming, otelGenai } = require('./index.js');

(async () => {
  // A2A Server, Client, AgentCard, and delegation tool
  const card = a2a.agentCard({ name: 'JSTestAgent', url: 'http://127.0.0.1:8000/api/a2a' });
  assert.equal(card.name, 'JSTestAgent');
  assert.equal(card.capabilities.streaming, false);
  assert.equal(card.protocolVersion, '0.3.0');

  const server = new a2a.A2AServer({
    card,
    handler: async (goal) => ({ status: 'complete', summary: `Handled: ${goal}` }),
  });

  const tool = a2a.a2aDelegationTool(server);
  const delegated = await tool.execute({ goal: 'Inspect repo' }, { sessionId: 's-1' });
  assert.equal(delegated.status.state, 'completed');
  assert.match(delegated.artifacts[0].parts[0].text, /Handled: Inspect repo/);

  const client = new a2a.A2AClient({
    endpoint: 'http://127.0.0.1:8000/api/a2a',
    fetch: async (_url, init) => {
      const frame = JSON.parse(init.body);
      const res = await server.handle(frame);
      return { ok: true, status: 200, json: async () => res };
    },
  });
  const sent = await client.sendTask('Remote check', { taskId: 't-100' });
  assert.equal(sent.id, 't-100');
  const got = await client.getTask('t-100');
  assert.equal(got.status.state, 'completed');
  await assert.rejects(client.cancelTask('t-100'), /terminal/);
  const paused = new a2a.A2AServer({handler: async () => ({status:'paused',summary:'Needs user input'})});
  const waiting = await paused.handle({jsonrpc:'2.0',id:1,method:'message/send',params:{message:{role:'user',parts:[{kind:'text',text:'Wait'}]}}});
  assert.equal(waiting.result.status.state, 'input-required');
  assert.equal(waiting.result.kind, 'task');
  assert.ok(waiting.result.contextId && waiting.result.history[0].messageId);
  const canceled = await paused.handle({jsonrpc:'2.0',id:2,method:'tasks/cancel',params:{id:waiting.result.id}});
  assert.equal(canceled.result.status.state, 'canceled');
  assert.throws(() => new a2a.A2AClient({ endpoint: 'http://remote.invalid/a2a', fetch: async () => ({}) }), /Invalid A2A/);

  // Streaming: SSE, AG-UI, ACPServer
  const sse = new streaming.SSEStreamBridge({ fmt: 'ag-ui', runId: 'r-1', threadId: 'th-1' });
  sse.emit({ kind: 'start' });
  sse.emit({ kind: 'action', value: { id: 'c1', tool: 'read_file', args: { path: 'a.txt' } } });
  sse.emit({ kind: 'observation', value: { id: 'c1', result: { ok: true } } });
  sse.emit({ kind: 'done', value: { summary: 'All done' } });
  assert.ok(sse.frames.some(f => f.includes('event: RUN_STARTED')));
  assert.ok(sse.frames.some(f => f.includes('event: TOOL_CALL_START')));
  assert.ok(sse.frames.some(f => f.includes('event: RUN_FINISHED')));

  const acp = new streaming.ACPServer({
    promptHandler: async (sid, _params, srv) => {
      srv.emitUpdate(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Working' } });
      return { stopReason: 'end_turn' };
    },
  });
  const initRes = await acp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(initRes.result.protocolVersion, 1);
  const newRes = await acp.handle({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: '.' } });
  const promptRes = await acp.handle({ jsonrpc: '2.0', id: 3, method: 'session/prompt', params: { sessionId: newRes.result.sessionId } });
  assert.equal(promptRes.result.stopReason, 'end_turn');
  assert.equal(acp.notifications.length, 1);

  // OpenTelemetry GenAI
  const parsedCtx = otelGenai.TraceContext.parse('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
  assert.equal(parsedCtx.traceparent(), '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
  const tracer = new otelGenai.GenAITracer({ traceContext: parsedCtx });
  const observer = new otelGenai.ReactOtelObserver(tracer, { agentName: 'js-agent', modelName: 'gpt-4o', system: 'openai' });
  observer.onEvent({ kind: 'start', sessionId: 's-1' });
  observer.onEvent({ kind: 'step_start' });
  observer.onEvent({ kind: 'action', value: { id: 'c1', tool: 'list_files' } });
  observer.onEvent({ kind: 'observation', value: { id: 'c1', ok: true } });
  observer.onEvent({ kind: 'done' });
  const otlp = tracer.exportOtlpJson();
  assert.equal(otlp.resourceSpans[0].scopeSpans[0].spans.length, 3);

  console.log('PASS JS protocols: A2A, SSE/AG-UI/ACP streaming, and OTel GenAI.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
