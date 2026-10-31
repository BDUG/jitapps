const assert = require("node:assert/strict"),
  C = require("../codingagentlib/javascript/context.js");
let reads = 0;
const events = Array.from({ length: 120 }, (_, index) => ({
  index,
  kind: "status",
  value: { text: "Earlier progress" },
}));
Object.defineProperty(events[10], "value", {
  enumerable: true,
  get() {
    reads++;
    return { text: "Omitted middle history" };
  },
});
events[0] = {
  index: 0,
  kind: "user",
  value: { status: "follow_up", text: "Preserve permissions and source files" },
};
events[30] = {
  index: 30,
  kind: "action",
  value: { id: "file", tool: "read_file", args: { path: "src/main.js" } },
};
events[31] = {
  index: 31,
  kind: "observation",
  value: {
    id: "file",
    tool: "read_file",
    ok: true,
    result: { hash: "old-hash", text: "Earlier source" },
  },
};
events[40] = {
  index: 40,
  kind: "observation",
  value: {
    id: "workflow",
    tool: "workflow_status",
    ok: true,
    result: {
      runId: "run",
      id: "flow",
      revision: 1,
      status: "paused",
      nextStep: 1,
      totalSteps: 3,
    },
  },
};
events.push({
  index: 120,
  kind: "observation",
  value: {
    id: "retained",
    tool: "read_history",
    ok: true,
    result: { text: "Exact original evidence 🧪\n".repeat(6000) },
  },
});
const raw = {
  events,
  goal: "Inspect and verify",
  instructions: ["Do not run commands"],
  permissions: { commands: false },
  responseSchema: { required: ["step"] },
};
for (const mode of ["aggressive", "balanced"]) {
  reads = 0;
  const view = C.pack(raw, { mode });
  assert.equal(
    reads,
    2,
    "Omitted record is visited for input size and one audit index, not rebuilt for fallback",
  );
  assert.deepEqual(
    view.payload.events.at(-1).value.result,
    events.at(-1).value.result,
  );
  assert.equal(view.stats.overTarget, true);
  assert.equal(
    view.payload.contextCompression.recentFileHashes[0].hash,
    "old-hash",
  );
  assert.equal(
    view.payload.contextCompression.workflowStates[0].status,
    "paused",
  );
  assert.ok(
    view.payload.events.some((e) => e.value?.args?.path === "src/main.js"),
  );
  assert.ok(
    view.payload.events.some(
      (e) => e.value?.text === "Preserve permissions and source files",
    ),
  );
  assert.equal(view.payload.permissions.commands, false);
  assert.deepEqual(view.payload.responseSchema, raw.responseSchema);
  assert.equal(view.stats.afterCharacters, JSON.stringify(view.payload).length);
}
events[31].value.result.hash = "new-hash";
events[40].value.result.status = "complete";
events.at(-1).value.result.text = "New evidence";
const updated = C.pack(raw);
assert.equal(
  updated.payload.contextCompression.recentFileHashes[0].hash,
  "new-hash",
);
assert.equal(
  updated.payload.contextCompression.workflowStates[0].status,
  "complete",
);
assert.equal(updated.payload.events.at(-1).value.result.text, "New evidence");
assert.equal(C.pack(raw, { mode: "off" }).payload, raw);
console.log(
  "PASS: one audit index per packing call, full large evidence, paired source actions, preserved constraints, exact metrics, updated workflows/hashes and Off identity.",
);
