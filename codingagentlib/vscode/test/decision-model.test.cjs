'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Controller } = require('../src/controller.cjs');
const DecisionModel = require('../src/decision-model.cjs');

test('decisionMode assist and gate advise, veto, and allow replanning', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-decision-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\n');
  const events = [];
  let sawAdvisory = false;
  let sawVeto = false;

  const worker = {
    session: { id: 'sess1', goal: 'Read a.txt', status: 'running', events: [] },
    step: 0,
    async call(op, params) {
      if (op === 'agent_start') return this.session;
      if (op === 'agent_next') {
        this.step += 1;
        return {
          sessionId: this.session.id,
          step: this.step,
          goal: this.session.goal,
          events: this.session.events,
          tools: [{ name: 'list_files' }, { name: 'read_file' }],
          permissions: { allowEdits: false, allowCommands: false },
          instructions: [],
        };
      }
      if (op === 'agent_submit') {
        const r = params.response;
        if (r.status === 'done') return { status: 'complete', summary: r.summary };
        this.session.events.push({ kind: 'observation', value: { tool: r.action.tool, ok: true, result: { text: 'hello\n' } } });
        return { status: 'continue', observation: { tool: r.action.tool, ok: true } };
      }
      return {};
    },
    async dispatch() { return {}; },
    async interrupt() {},
  };

  const controller = new Controller(
    worker,
    async (req) => {
      assert.ok(req.decision, 'advisory decision must be attached');
      sawAdvisory = true;
      const obs = (req.events || []).some((e) => e.kind === 'observation');
      if (obs) {
        return {
          sessionId: req.sessionId,
          step: req.step,
          status: 'done',
          plan: 'Finish',
          action: null,
          summary: 'Read a.txt after gate',
        };
      }
      if (req.repairHint?.source === 'decision_model') {
        return {
          sessionId: req.sessionId,
          step: req.step,
          status: 'act',
          plan: 'Read a.txt',
          action: { tool: 'read_file', args: { path: 'a.txt' } },
        };
      }
      return {
        sessionId: req.sessionId,
        step: req.step,
        status: 'act',
        plan: 'List first',
        action: { tool: 'list_files', args: {} },
      };
    },
    (ev) => events.push(ev),
  );

  const res = await controller.run(
    'Read a.txt',
    { edits: false, commands: false },
    10,
    false,
    [],
    [],
    'run',
    0,
    'build',
    {
      decisionMode: 'gate',
      decisionModel: async (dreq) => {
        assert.equal(dreq.format, 'codingagentlib/decision-request-v1');
        if (dreq.phase === 'gate') {
          if (dreq.candidate?.action?.tool === 'list_files') {
            sawVeto = true;
            return { approve: false, rationale: 'Read a.txt directly', strategy: 'read_file' };
          }
          return { approve: true };
        }
        return { approve: true, strategy: 'Prefer read_file', focus: 'a.txt' };
      },
    },
  );

  assert.equal(res.status, 'complete');
  assert.equal(sawAdvisory, true);
  assert.equal(sawVeto, true);
  assert.ok(events.some((e) => e.kind === 'decision' && e.mode === 'gate'));
  assert.ok(events.some((e) => e.kind === 'decisionGate' && e.decision.approve === false));
  assert.equal(DecisionModel.resolveMode(null, 'off'), 'off');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Controller supports bounded spawn_agent sub-agent delegation', async () => {
  let nextId = 0;
  const worker = {
    sessions: new Map(),
    async call(op, params) {
      if (op === 'agent_start') {
        const id = 'sess-' + (++nextId);
        const s = { id, goal: params.goal, status: 'running', events: [], step: 0, allowEdits: params.allow_edits, allowCommands: params.allow_commands };
        this.sessions.set(id, s);
        return s;
      }
      if (op === 'agent_next') {
        const s = this.sessions.get(params.session_id);
        s.step += 1;
        return {
          sessionId: s.id,
          step: s.step,
          goal: s.goal,
          events: s.events,
          tools: [{ name: 'read_file' }],
          permissions: { allowEdits: s.allowEdits, allowCommands: s.allowCommands },
          instructions: [],
        };
      }
      if (op === 'agent_submit') {
        const r = params.response;
        if (r.status === 'done') return { status: 'complete', summary: r.summary };
        return { status: 'continue', observation: { tool: r.action.tool, ok: true } };
      }
      return {};
    },
    async dispatch(params) {
      if (params.op === 'event' && params.value?.kind === 'observation') {
        this.sessions.get(params.session).events.push({ kind: 'observation', value: params.value });
      }
      return {};
    },
    async interrupt() {},
  };

  const controller = new Controller(worker, async (req) => {
    if (req.goal === 'Subtask') {
      assert.equal(req.permissions.allowEdits, false);
      return { sessionId: req.sessionId, step: req.step, status: 'done', plan: 'Done', action: null, summary: 'Subtask complete' };
    }
    if ((req.events || []).some((e) => e.kind === 'observation' && e.value?.tool === 'spawn_agent')) {
      return { sessionId: req.sessionId, step: req.step, status: 'done', plan: 'Finish', action: null, summary: 'Parent complete' };
    }
    assert.ok(req.tools.some((t) => t.name === 'spawn_agent'));
    return {
      sessionId: req.sessionId,
      step: req.step,
      status: 'act',
      plan: 'Delegate',
      action: { tool: 'spawn_agent', args: { goal: 'Subtask', allowEdits: true, maxSteps: 4 } },
    };
  });

  const res = await controller.run('Parent goal', { edits: false, commands: false }, 10);
  assert.equal(res.status, 'complete');
  assert.equal(res.summary, 'Parent complete');
});
