const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  { ProjectMemory } = require("../src/project-memory.cjs"),
  { Worker } = require("../src/worker.cjs");
async function fixture(t) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "native-project-memory-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: new ProjectMemory(path.join(root, "private-storage")) };
}
const note = {
  title: "API decision",
  text: "Cursor pagination uses stable customer IDs. 🧪",
  category: "decision",
  pinned: true,
};
test("workspace/project isolation, persisted notes and metadata-only pages", async (t) => {
  const { root, store } = await fixture(t),
    data = await store.dispatch(root, {
      project: "A",
      action: "save",
      ...note,
    });
  assert.equal(
    (await store.dispatch(root, { project: "A", action: "list" })).total,
    1,
  );
  assert.equal(
    (await store.dispatch(root, { project: "B", action: "list" })).total,
    0,
  );
  assert.equal(
    (await store.dispatch(root + "/other", { project: "A", action: "list" }))
      .total,
    0,
  );
  const reloaded = new ProjectMemory(store.storage);
  assert.equal(
    (
      await reloaded.dispatch(root, {
        project: "A",
        action: "read",
        id: data.id,
      })
    ).text,
    note.text,
  );
  assert.ok(
    !(
      "text" in
      (await reloaded.dispatch(root, { project: "A", action: "list" })).notes[0]
    ),
  );
});
test("revision conflicts and token-index invalidation preserve current content", async (t) => {
  const { root, store } = await fixture(t),
    created = await store.dispatch(root, {
      project: "A",
      action: "save",
      ...note,
    });
  const second = new ProjectMemory(store.storage);
  await second.dispatch(root, {
    project: "A",
    action: "search",
    query: "pagination",
  });
  await store.dispatch(root, {
    project: "A",
    action: "save",
    ...note,
    text: "quartz replacement",
    pinned: false,
    id: created.id,
    expectedRevision: created.revision,
  });
  await assert.rejects(
    store.dispatch(root, {
      project: "A",
      action: "save",
      ...note,
      id: created.id,
      expectedRevision: created.revision,
    }),
    /changed/,
  );
  assert.equal(
    (
      await second.dispatch(root, {
        project: "A",
        action: "search",
        query: "quartz",
      })
    ).matches.length,
    1,
  );
  assert.equal(
    (
      await second.dispatch(root, {
        project: "A",
        action: "search",
        query: "pagination",
      })
    ).matches.length,
    0,
  );
});
test("expired/archived entries stay browsable but leave recall, delete requires revision", async (t) => {
  const { root, store } = await fixture(t);
  for (const options of [{ archived: true }, { expires: "2000-01-01" }, {}])
    await store.dispatch(root, {
      project: "A",
      action: "save",
      ...note,
      ...options,
    });
  assert.equal(
    (await store.dispatch(root, { project: "A", action: "list" })).total,
    3,
  );
  const result = await store.dispatch(root, {
    project: "A",
    action: "search",
    query: "pagination",
  });
  assert.equal(result.matches.length, 1);
  await assert.rejects(
    store.dispatch(root, {
      project: "A",
      action: "delete",
      id: result.matches[0].id,
      expectedRevision: "old",
    }),
    /changed/,
  );
  await store.dispatch(root, {
    project: "A",
    action: "delete",
    id: result.matches[0].id,
    expectedRevision: result.matches[0].revision,
  });
  assert.equal(
    (
      await store.dispatch(root, {
        project: "A",
        action: "search",
        query: "pagination",
      })
    ).matches.length,
    0,
  );
});
test("native worker binds paged snapshots and rejects unapproved notes/projects", async (t) => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "native-memory-snapshot-"),
    ),
    worker = new Worker(
      path.resolve(__dirname, "../bin/codingagent-worker"),
      root,
    );
  t.after(async () => {
    await worker.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const session = await worker.call("agent_start", {
    goal: "Inspect project notes",
  });
  const request = await worker.call("agent_next", { session_id: session.id });
  await worker.call("agent_project_memory", {
    session_id: session.id,
    project: "A",
    notes: [{ id: "approved", ...note, revision: "original" }],
  });
  await assert.rejects(
    worker.call("agent_project_memory", {
      session_id: session.id,
      project: "B",
      notes: [],
    }),
    /another memory project/,
  );
  const result = await worker.call("agent_submit", {
    session_id: session.id,
    response: {
      sessionId: session.id,
      step: request.step,
      status: "act",
      plan: "Read the approved reference snapshot",
      action: {
        tool: "read_project_memory",
        args: { id: "approved", offset: 2, limit: 12 },
      },
    },
  });
  assert.equal(result.observation.ok, true);
  assert.equal(
    result.observation.result.text,
    [...note.text].slice(2, 14).join(""),
  );
  assert.equal(result.observation.result.project, "A");
  const next = await worker.call("agent_next", { session_id: session.id });
  const blocked = await worker.call("agent_submit", {
    session_id: session.id,
    response: {
      sessionId: session.id,
      step: next.step,
      status: "act",
      plan: "Inspect missing reference",
      action: { tool: "read_project_memory", args: { id: "unapproved" } },
    },
  });
  assert.equal(blocked.observation.ok, false);
});
test('full project-memory reads remain retained above the model-history soft budget',()=>{const {prepare}=require('../src/history-context.cjs'),text='original note 🧪 '.repeat(700);const request={tools:[{name:'read_history'}],events:[{kind:'user',value:{status:'follow_up',text:'Original requirement '.repeat(1000)}},{kind:'observation',value:{tool:'read_project_memory',ok:true,result:{id:'note',text}}},...Array.from({length:30},()=>({kind:'assistant',value:{plan:'Later step'}}))]};const result=prepare(request,{budget:8000});assert.ok(result.request.events.some(e=>e.value?.tool==='read_project_memory'&&e.value.result.text===text));assert.equal(result.metadata.overBudget,true);});
