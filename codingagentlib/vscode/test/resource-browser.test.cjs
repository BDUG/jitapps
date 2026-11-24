'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const RB = require('../src/resource-browser.cjs');

function memoryContext() {
  const store = new Map();
  return {
    workspaceState: {
      get: (k) => store.get(k),
      update: async (k, v) => { store.set(k, v); },
    },
  };
}

test('resource browser toggles disable and applies per-session edits across memory, skills, agents, and tools', async () => {
  const ctx = memoryContext();
  await RB.toggleDisabled(ctx, '/ws', 'sess-1', 'skills', 's1');
  await RB.toggleDisabled(ctx, '/ws', 'sess-1', 'tools', 'run_command');
  await RB.saveEdit(ctx, '/ws', 'sess-1', 'skills', 's2', { description: 'Updated', body: 'New body' });
  await RB.saveEdit(ctx, '/ws', 'sess-1', 'agents', 'planner', { description: 'Custom planner', instructions: 'Custom instructions' });
  await RB.saveEdit(ctx, '/ws', 'sess-1', 'memory', 'm1', { title: 'Edited note', text: 'Updated memory text' });
  await RB.selectActiveAgent(ctx, '/ws', 'sess-1', 'planner');

  const ov1 = RB.getOverrides(ctx, '/ws', 'sess-1');
  const ov2 = RB.getOverrides(ctx, '/ws', 'sess-2');
  assert.equal(ov2.disabled.skills.length, 0);
  assert.equal(ov1.activeAgent, 'planner');

  const skills = RB.applySkills([
    { name: 's1', description: 'One', body: 'B1' },
    { name: 's2', description: 'Two', body: 'B2' },
  ], ov1);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 's2');
  assert.equal(skills[0].body, 'New body');

  const agents = RB.applyAgents([{ name: 'planner', description: 'Old', instructions: 'Old' }], ov1);
  assert.equal(agents[0].instructions, 'Custom instructions');

  const tools = RB.applyTools([{ name: 'read_file' }, { name: 'run_command' }], ov1);
  assert.deepEqual(tools.map((t) => t.name), ['read_file']);

  const mem = RB.applyMemory([{ id: 'm1', title: 'Old', text: 'Old' }], ov1);
  assert.equal(mem[0].text, 'Updated memory text');

  const catalog = RB.buildCatalog({
    memoryNotes: [{ id: 'm1', title: 'Old', text: 'Old', category: 'note' }],
    skills: [{ name: 's1', description: 'One', body: 'B1', path: '.agents/skills/s1/SKILL.md' }],
    agents: [{ name: 'planner', source: 'builtin', description: 'Old', instructions: 'Old' }],
    tools: [{ name: 'run_command', description: 'Run' }],
    workflows: [{ id: 'wf1', name: 'WF 1', description: 'Desc' }],
    overrides: ov1,
  });
  assert.equal(catalog.memory[0].edited, true);
  assert.equal(catalog.skills[0].disabled, true);
  assert.equal(catalog.agents[0].active, true);
  assert.equal(catalog.tools[0].disabled, true);
  assert.equal(catalog.workflows.length, 1);
});
