const assert = require("node:assert/strict");
global.SuiteCodingAgentSpec = require("./spec.js");
const L = require("./loop.js");
function history(period, rounds = 3) {
  const events = [];
  for (let r = 0; r < rounds; r++)
    for (let i = 0; i < period; i++) {
      const id = "receipt-" + r + "-" + i;
      events.push(
        {
          kind: "action",
          value: {
            id,
            tool: "read_file",
            args: { path: "file-" + i },
            taskId: "task-" + r,
            expectation: "Changing wording " + r,
          },
        },
        {
          kind: "observation",
          value: {
            id,
            tool: "read_file",
            ok: false,
            error: "Missing file",
            result: {
              jobId: "job-" + id,
              finishedAt: String(r),
              text: "unchanged",
            },
          },
        },
      );
    }
  return events;
}
for (const period of [1, 2, 3, 4, 8])
  assert.deepEqual(
    L.repetition(history(period), {
      tool: "read_file",
      args: { path: "file-0" },
      taskId: "different-task",
    }),
    { period, repetitions: 3 },
  );
assert.equal(
  L.repetition(history(8, 2), { tool: "read_file", args: { path: "file-0" } }),
  null,
);
let events = history(1);
events.at(-1).value.result.text = "Actual new data";
assert.equal(
  L.stalled(events, { tool: "read_file", args: { path: "file-0" } }),
  false,
);
events = history(1);
events.at(-1).value.checks = { passed: true };
assert.equal(
  L.stalled(events, { tool: "read_file", args: { path: "file-0" } }),
  false,
);
events = history(1);
assert.equal(
  L.stalled([...events, { kind: "user", value: { status: "follow_up" } }], {
    tool: "read_file",
    args: { path: "file-0" },
  }),
  false,
);
const one = history(1, 1);
assert.equal(
  L.stalled([...one, one[1], one[1]], {
    tool: "read_file",
    args: { path: "file-0" },
  }),
  false,
);
const delayed = [];
for (let r = 0; r < 3; r++) {
  delayed.push(
    {
      kind: "action",
      value: { id: "a" + r, tool: "read_file", args: { path: "a" } },
    },
    {
      kind: "action",
      value: { id: "b" + r, tool: "read_file", args: { path: "b" } },
    },
    {
      kind: "observation",
      value: { id: "unrelated" + r, tool: "read_file", ok: false, error: "No" },
    },
    {
      kind: "observation",
      value: { id: "a" + r, tool: "read_file", ok: false, error: "No A" },
    },
    {
      kind: "observation",
      value: { id: "b" + r, tool: "read_file", ok: false, error: "No B" },
    },
  );
}
assert.deepEqual(
  L.repetition(delayed, { tool: "read_file", args: { path: "a" } }),
  { period: 2, repetitions: 3 },
);
const longPrefix = [];
for (let i = 0; i < 1000; i++) {
  const id = "old-" + i;
  longPrefix.push(
    {
      kind: "action",
      value: { id, tool: "read_file", args: { path: "old-" + i } },
    },
    {
      kind: "observation",
      value: {
        id,
        tool: "read_file",
        ok: true,
        result: { text: "large archived Unicode 🧪 ".repeat(400) },
      },
    },
  );
}
const tail = history(8),
  longEvents = [...longPrefix, ...tail],
  before = JSON.stringify(longEvents);
assert.deepEqual(
  L.repetition(longEvents, { tool: "read_file", args: { path: "file-0" } }),
  { period: 8, repetitions: 3 },
);
assert.equal(JSON.stringify(longEvents), before);
assert.equal(
  L.repetition(
    [...longEvents, { kind: "user", value: { status: "follow_up" } }],
    { tool: "read_file", args: { path: "file-0" } },
  ),
  null,
);
const changed = JSON.parse(JSON.stringify(longEvents));
changed.at(-1).value.result.text = "actual progress";
assert.equal(
  L.repetition(changed, { tool: "read_file", args: { path: "file-0" } }),
  null,
);
(async () => {
  const state = {
    id: "long-cycle",
    events: [],
    tools: [{ name: "read_file" }],
  };
  let calls = 0,
    records = [];
  const result = await L.run(state, {
    batch: 0,
    model: async (r) =>
      JSON.stringify({
        sessionId: r.sessionId,
        step: r.step,
        status: "act",
        plan: "Inspect repeated file",
        action: {
          tool: "read_file",
          args: { path: "file-" + ((r.step - 1) % 4) },
        },
      }),
    act: async () => {
      calls++;
      return { ok: false, error: "Missing file" };
    },
    record: async (v) => records.push(v),
    finish: async () => assert.fail("No completion"),
  });
  assert.equal(result.status, "waiting");
  assert.equal(calls, 12);
  assert.match(result.question, /cycle of 4/);
  assert.equal(records.at(-1).action, null);
  console.log(
    "PASS cycle detection: eight-action cycles, execution-only signatures, actual progress, checks, exact delayed receipts, duplicate suppression, follow-up reset and pause without replay.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

const parallelEvents = [];
for (let i = 0; i < 3; i++) {
  const id = "parallel-" + i;
  parallelEvents.push(
    {
      kind: "action",
      value: {
        id,
        tool: "parallel_read",
        args: { reads: [{ tool: "read_file", args: { path: "a" } }] },
      },
    },
    {
      kind: "observation",
      value: {
        id: id + "-child",
        parentCallId: id,
        tool: "read_file",
        ok: true,
        result: { text: "same" },
      },
    },
    {
      kind: "observation",
      value: {
        id,
        tool: "parallel_read",
        ok: true,
        result: {
          format: "codingagentlib/parallel-read-v1",
          results: [
            {
              callId: id + "-child",
              tool: "read_file",
              ok: true,
              result: { text: "same" },
            },
          ],
        },
      },
    },
  );
}
assert.deepEqual(
  L.repetition(parallelEvents, {
    tool: "parallel_read",
    args: { reads: [{ tool: "read_file", args: { path: "a" } }] },
  }),
  { period: 1, repetitions: 3 },
);
parallelEvents.at(-1).value.result.results[0].result.text = "changed";
assert.equal(
  L.repetition(parallelEvents, {
    tool: "parallel_read",
    args: { reads: [{ tool: "read_file", args: { path: "a" } }] },
  }),
  null,
);
