const assert = require("node:assert/strict"),
  { performance } = require("node:perf_hooks");
const path = require("node:path");
if (!process.argv[2])
  throw Error(
    "Usage: node --expose-gc scripts/benchmark-history.cjs /path/to/baseline.cjs",
  );
const before = require(path.resolve(process.argv[2])).prepare,
  after = require("../src/history-context.cjs").prepare;
const events = Array.from({ length: 1000 }, (_, i) => ({
  kind: "observation",
  value: {
    id: "c" + i,
    tool: "read_file",
    ok: true,
    result: { text: "🧪 source " + i + "\n" + "a".repeat(16000) },
  },
}));
events.unshift({
  kind: "user",
  value: { status: "follow_up", text: "Preserve public APIs" },
});
const request = {
  sessionId: "benchmark",
  step: 500,
  goal: "Inspect current source",
  instructions: ["Native rules"],
  tools: [{ name: "read_history" }],
  events,
};
const options = { budget: 80000 };
assert.deepEqual(after(request, options), before(request, options));
function measure(fn) {
  for (let i = 0; i < 3; i++) fn(request, options);
  const samples = [];
  for (let i = 0; i < 9; i++) {
    global.gc?.();
    const start = performance.now();
    fn(request, options);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[4];
}
const oldMs = measure(before),
  newMs = measure(after),
  result = {
    events: events.length,
    inputCharacters: JSON.stringify(request).length,
    retainedEvents: after(request, options).metadata.retainedEvents,
    medianBeforeMs: oldMs,
    medianAfterMs: newMs,
    speedup: oldMs / newMs,
    scope:
      "Model-history preparation only; no inference, network, native runtime or tools.",
  };
console.log(JSON.stringify(result, null, 2));
// Compare former and current implementation over varied native JSON histories.
let seed = 41;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (let n = 0; n < 100; n++) {
  const log = Array.from({ length: 40 + Math.floor(random() * 80) }, (_, i) => {
    const tool = [
      "read_file",
      "write_file",
      "run_command",
      "read_history",
      "replace_text",
    ][Math.floor(random() * 5)];
    return {
      kind: "observation",
      value: {
        id: "call" + i,
        tool,
        ok: random() > 0.2,
        checks: { passed: random() > 0.15 },
        result: {
          text: "record " + i + " 🧪 ".repeat(Math.floor(random() * 300)),
          exitCode:
            tool === "run_command" ? (random() > 0.3 ? 0 : 2) : undefined,
          timedOut: random() < 0.05,
          path: "src/" + i,
        },
      },
    };
  });
  log[2] = {
    kind: "user",
    value: {
      status: "reference_files",
      attachments: [
        { name: "source", content: "immutable reference ".repeat(800) },
      ],
    },
  };
  log[8] = {
    kind: "assistant",
    value: { tasks: [{ id: "task", title: "Verify", status: "pending" }] },
  };
  log[11] = { kind: "protocol_error", value: { error: "Missing action" } };
  for (const enabled of [true, false])
    for (const retrieval of [true, false]) {
      const r = {
        ...request,
        events: log,
        tools: retrieval ? request.tools : [],
      };
      assert.deepEqual(
        after(r, { enabled, budget: 8000 }),
        before(r, { enabled, budget: 8000 }),
      );
    }
}
console.log(
  "PASS: exact baseline equality across 400 varied mode/history cases.",
);
