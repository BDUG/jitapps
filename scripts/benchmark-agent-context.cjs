const assert = require("node:assert/strict"),
  { performance } = require("node:perf_hooks");
const path = require("node:path");
if (!process.argv[2])
  throw Error(
    "Usage: node --expose-gc scripts/benchmark-agent-context.cjs /path/to/baseline.cjs",
  );
const before = require(path.resolve(process.argv[2])),
  after = require("../codingagentlib/javascript/context.js");
const events = [];
for (let i = 0; i < 5000; i++) {
  events.push({
    index: events.length,
    kind: "action",
    value: {
      id: "c" + i,
      tool: "read_file",
      args: { path: "src/" + i + ".js" },
    },
  });
  events.push({
    index: events.length,
    kind: "observation",
    value: {
      id: "c" + i,
      tool: "read_file",
      ok: true,
      result: { hash: "hash" + i, text: "source " + i },
    },
  });
}
events.push({
  index: events.length,
  kind: "observation",
  value: {
    id: "last",
    tool: "read_history",
    ok: true,
    result: { text: "Retained source ".repeat(8000) },
  },
});
const request = {
    goal: "Inspect current workspace",
    instructions: ["Preserve constraints"],
    events,
  },
  options = { mode: "aggressive", snapshot: "a".repeat(64) };
assert.deepEqual(after.pack(request, options), before.pack(request, options));
function measure(fn) {
  for (let i = 0; i < 4; i++) fn(request, options);
  const times = [];
  for (let i = 0; i < 15; i++) {
    global.gc?.();
    const start = performance.now();
    fn(request, options);
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[7];
}
const oldMs = measure(before.pack),
  newMs = measure(after.pack);
console.log(
  JSON.stringify(
    {
      events: events.length,
      inputCharacters: JSON.stringify(request).length,
      beforeMs: oldMs,
      afterMs: newMs,
      speedup: oldMs / newMs,
      scope:
        "Browser context packing with soft-target fallback; excludes inference/network/tools.",
    },
    null,
    2,
  ),
);
let seed = 19;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (let n = 0; n < 100; n++) {
  const events = [];
  for (let i = 0; i < 60; i++) {
    const tool = [
        "read_file",
        "read_history",
        "workflow_status",
        "run_command",
        "code_symbols",
      ][Math.floor(rand() * 5)],
      id = "c" + i;
    events.push({
      index: events.length,
      kind: "action",
      value: { id, tool, args: { path: "src/" + i } },
    });
    events.push({
      index: events.length,
      kind: "observation",
      value: {
        id,
        tool,
        ok: rand() > 0.2,
        result: {
          hash: "h" + i,
          text: "🧪 original ".repeat(Math.floor(rand() * 1000)),
          ...(tool === "workflow_status"
            ? {
                runId: "run" + (i % 3),
                status: "paused",
                nextStep: i,
                totalSteps: 100,
              }
            : {}),
        },
      },
    });
  }
  events[5] = {
    index: 5,
    kind: "user",
    value: {
      status: "follow_up",
      text: "No edits",
      attachments: [{ content: "original ".repeat(1000) }],
    },
  };
  events[11] = {
    index: 11,
    kind: "user",
    value: {
      format: "codingagentlib/model-collaboration/v1",
      status: "model_collaboration_round",
      step: 2,
      reason: "Review",
      text: "advisory ".repeat(1000),
    },
  };
  const r = {
    ...request,
    events,
    appContext: {
      schema: { required: ["name"] },
      name: "Test",
      content: "source ".repeat(30000),
    },
    workingMemory: {
      matches: [{ id: "m", part: 0, text: "memory ".repeat(1000) }],
    },
  };
  for (const mode of ["aggressive", "balanced", "off"])
    for (const snapshot of [null, "b".repeat(64)])
      assert.deepEqual(
        after.pack(r, { mode, snapshot }),
        before.pack(r, { mode, snapshot }),
      );
}
console.log(
  "PASS: exact baseline equality across 600 context mode/snapshot cases.",
);
