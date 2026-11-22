const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ChatCommands = require('../src/chat-commands.cjs');
const AgentLibrary = require('../src/agent-library.cjs');
const { Controller } = require('../src/controller.cjs');

test('parseChatInput parses slash commands and @ mentions', () => {
  const parsed = ChatCommands.parseChatInput('/goal Fix @file:src/app.js using @skill:my-skill and @agent:reviewer with @selection @problems');
  assert.equal(parsed.command, 'goal');
  assert.ok(parsed.prompt.startsWith('Fix '));
  assert.deepEqual(parsed.mentions.map(m => m.kind), ['file', 'skill', 'agent', 'selection', 'problems']);
  assert.equal(parsed.mentions[0].path, 'src/app.js');
  assert.equal(parsed.mentions[1].name, 'my-skill');
  assert.equal(parsed.mentions[2].name, 'reviewer');

  const pathShorthand = ChatCommands.parseChatInput('Check @src/index.js and @changes');
  assert.equal(pathShorthand.command, null);
  assert.deepEqual(pathShorthand.mentions.map(m => m.kind), ['file', 'changes']);
  assert.match(ChatCommands.formatHelpText(), /\/goal/);
});

test('AgentLibrary discovers skills and agents safely, matches skills, and enforces guardrails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-agent-lib-'));
  try {
    await fs.mkdir(path.join(root, '.agents', 'skills', 'test-skill'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.agents', 'skills', 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: Verify TypeScript builds and unit tests\n---\nAlways run npm test.'
    );
    await fs.mkdir(path.join(root, '.agents', 'agents'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.agents', 'agents', 'custom_auditor.md'),
      '---\nname: custom_auditor\ndescription: Custom auditor\n---\nCheck all boundaries.'
    );

    const skills = await AgentLibrary.discoverSkills(root);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, 'test-skill');

    const matched = AgentLibrary.matchSkills(skills, 'Run unit tests for TypeScript');
    assert.equal(matched.length, 1);
    assert.equal(matched[0].name, 'test-skill');

    const agents = await AgentLibrary.discoverAgents(root);
    assert.ok(agents.some(a => a.name === 'custom_auditor'));
    assert.equal(AgentLibrary.selectAgent(agents, { requestedName: 'custom_auditor' }).name, 'custom_auditor');
    assert.equal(AgentLibrary.selectAgent(agents, { executionMode: 'plan' }).name, 'planner');

    const blocked = AgentLibrary.checkDestructiveAction({
      tool: 'run_command',
      args: { command: 'rm', args: ['-rf', '/'] },
    });
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.rule, 'root_wipe');
    assert.equal(AgentLibrary.checkDestructiveAction({ tool: 'run_command', args: { command: 'npm', args: ['test'] } }), null);

    const redacted = AgentLibrary.redactSecrets('token=sk-1234567890abcdef1234567890 Bearer abcdefghijklmnopqrst');
    assert.ok(!redacted.includes('sk-1234567890'));
    assert.ok(!redacted.includes('abcdefghijklmnopqrst'));
    assert.ok(redacted.includes('[REDACTED]'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('file mentions preserve page selectors, including invalid selectors for resolver errors', () => {
  for (const page of ['2', '0', '-1', 'abc', '9007199254740992']) {
    const parsed = ChatCommands.parseChatInput('/plan Inspect @file:src/large.txt#page=' + page);
    assert.equal(parsed.mentions[0].path, 'src/large.txt#page=' + page);
    assert.equal(parsed.mentions[0].raw, '@file:src/large.txt#page=' + page);
  }
});

test('text previews enforce a combined budget without splitting Unicode or altering media', () => {
  const References = require('../src/attachments.cjs');
  const media = { name: 'image.png', dataUrl: 'data:image/png;base64,YQ==' };
  const original = [
    { name: 'one', content: 'a'.repeat(999) + '😀' + 'b'.repeat(2000) },
    { name: 'two', content: 'c'.repeat(3000) }, media,
  ];
  const summarized = References.summarizeAttachments(original, { maxInlineChars: 1000, pageSize: 1000 });
  assert.equal(summarized[0].content, 'a'.repeat(999));
  assert.equal(summarized[1].content, 'c');
  assert.equal(summarized.reduce((n, item) => n + (item.content?.length || 0), 0), 1000);
  assert.strictEqual(summarized[2], media);
  assert.equal(original[0].content.length, 3001);
  assert.ok(summarized[0].previewTruncated && summarized[1].previewTruncated);
  assert.deepEqual(References.paginateText(original[0].content, 1000).join(''), original[0].content);
  assert.equal(References.summarizeAttachments(original, { maxInlineChars: 0 })[0].content, '');
  assert.throws(() => References.summarizeAttachments(original, { maxInlineChars: -1 }), /budget/);
});

test('Controller applies capabilities, redacts diagnostics secrets, and blocks destructive commands', async () => {
  let submitted = false;
  let capturedRequest = null;
  const worker = {
    async call(method, params) {
      if (method === 'agent_start') return { id: 'sess-1', goal: params.goal, status: 'running', events: [] };
      if (method === 'agent_next') {
        return {
          sessionId: 'sess-1',
          step: 1,
          goal: params?.goal || 'test',
          events: [],
          tools: [{ name: 'run_command' }],
          permissions: { allowEdits: true, allowCommands: true },
        };
      }
      if (method === 'agent_submit') {
        submitted = true;
        return { status: 'complete' };
      }
      return {};
    },
    async dispatch() { return {}; },
    async interrupt() {},
  };
  const events = [];
  const controller = new Controller(
    worker,
    async (req) => {
      capturedRequest = req;
      return {
        sessionId: req.sessionId,
        step: req.step,
        status: 'act',
        plan: 'Dangerous cleanup',
        action: { tool: 'run_command', args: { command: 'git', args: ['push', '--force'] } },
      };
    },
    (ev) => events.push(ev),
    async () => ({ approved: true }),
    async () => ({
      diagnostics: [{ path: 'a.js', severity: 'error', message: 'Leaked sk-1234567890abcdef1234567890', range: { start: { line: 1, column: 1 } } }],
      totalDiagnostics: 1,
      omittedDiagnostics: 0,
      counts: { error: 1, warning: 0 },
    }),
    async () => {},
    async () => ({
      agent: { name: 'implementer' },
      skills: [{ name: 'test-skill' }],
      instructionNotes: ['Use test-skill'],
    })
  );

  const res = await controller.run('Test', { edits: true, commands: true }, 10);
  assert.equal(res.status, 'paused');
  assert.equal(res.reason, 'guardrail_blocked');
  assert.equal(submitted, false);
  assert.equal(capturedRequest.codingAgentCapabilities.agent.name, 'implementer');
  assert.ok(!capturedRequest.ideContext.diagnostics[0].message.includes('sk-1234567890'));
  assert.ok(events.some(e => e.kind === 'info' && /Guardrail blocked/.test(e.text)));
});

test('References paginate large/multiple text attachments and read specific file pages', async () => {
  const References = require('../src/attachments.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-att-page-'));
  try {
    const largeText = 'Line content ABCDEF\n'.repeat(2000); // ~40,000 chars
    await fs.writeFile(path.join(root, 'large.txt'), largeText);
    const small = await References.attachment(root, path.join(root, 'large.txt'));
    const summarized = References.summarizeAttachments([small, { ...small, name: 'large2.txt', path: 'large2.txt' }], {
      maxInlineChars: 15000,
      pageSize: 5000,
    });
    assert.equal(summarized.length, 2);
    assert.equal(summarized[0].paged, true);
    assert.equal(summarized[0].totalPages, Math.ceil(largeText.length / 5000));
    assert.ok(summarized[0].content.length <= 5000);

    const page2 = await References.readAttachmentPage(root, path.join(root, 'large.txt'), { page: 1, pageSize: 5000 });
    assert.equal(page2.page, 1);
    assert.equal(page2.totalPages, summarized[0].totalPages);
    assert.equal(page2.content, largeText.slice(5000, 10000));
    for (const page of [-1, 0.5, Infinity, '1', 999]) {
      await assert.rejects(References.readAttachmentPage(root, path.join(root, 'large.txt'), { page, pageSize: 5000 }), /Page index|unavailable/);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
