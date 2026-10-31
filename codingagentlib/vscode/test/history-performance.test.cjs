const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { prepare } = require("../src/history-context.cjs");
const observation = (i, text = "x".repeat(1400)) => ({
  kind: "observation",
  value: { id: "call-" + i, tool: "read_file", ok: true, result: { text } },
});
function request(events) {
  return {
    sessionId: "source",
    step: 2,
    goal: "Preserve constraints",
    instructions: ["Do not modify public APIs."],
    tools: [{ name: "read_history" }],
    permissions: { edits: false },
    events,
  };
}
test("compacted histories deeply isolate retained records and exact offsets without copying omitted payloads", () => {
  const events = Array.from({ length: 500 }, (_, i) =>
    observation(i, "🧪 Unicode source " + i + "\n" + "x".repeat(4000)),
  );
  events[2] = {
    kind: "user",
    value: { status: "follow_up", text: "Keep src/private.js unchanged" },
  };
  events[3] = {
    kind: "assistant",
    value: { tasks: [{ id: "t", title: "Inspect first", status: "pending" }] },
  };
  const raw = request(events),
    before = JSON.stringify(raw),
    view = prepare(raw, { budget: 8000 });
  assert.equal(view.metadata.mode, "compacted");
  assert.equal(view.metadata.originalCharacters, JSON.stringify(events).length);
  assert.equal(
    view.metadata.retainedCharacters,
    JSON.stringify(view.request.events).length,
  );
  assert.ok(view.metadata.retainedEventIndexes.includes(2));
  assert.ok(view.metadata.retainedEventIndexes.includes(3));
  view.metadata.retainedEventIndexes.forEach((index, i) =>
    assert.deepEqual(view.request.events[i], events[index]),
  );
  assert.equal(JSON.stringify(raw), before);
  view.request.events[0].value.text = "Changed view";
  view.request.permissions.edits = true;
  assert.equal(JSON.stringify(raw), before);
  const next = prepare(raw, { budget: 8000 });
  assert.equal(
    next.request.events[0].value.text,
    "Keep src/private.js unchanged",
  );
  // Updating the source between calls must not reuse stale cached serialization.
  events[2].value.text = "New follow-up constraint";
  assert.equal(
    prepare(raw, { budget: 8000 }).request.events[0].value.text,
    "New follow-up constraint",
  );
});
test("pinned snapshots and retrieved evidence remain complete above the soft budget", () => {
  const text = "reference snapshot ".repeat(8000),
    events = [
      {
        kind: "user",
        value: {
          status: "reference_files",
          attachments: [{ name: "requirements", content: text }],
        },
      },
      ...Array.from({ length: 80 }, (_, i) => observation(i)),
      {
        kind: "observation",
        value: {
          id: "history",
          tool: "read_history",
          ok: true,
          result: { events: [observation(0, text)] },
        },
      },
    ];
  const view = prepare(request(events), { budget: 8000 });
  assert.equal(view.metadata.overBudget, true);
  assert.equal(view.request.events[0].value.attachments[0].content, text);
  assert.deepEqual(view.request.events.at(-1), events.at(-1));
  assert.equal(
    view.metadata.retainedCharacters,
    JSON.stringify(view.request.events).length,
  );
});
test("off, retrieval-unavailable and small histories keep the same full JSON copy semantics", () => {
  for (const raw of [
    request([observation(1)]),
    {
      ...request(Array.from({ length: 50 }, (_, i) => observation(i))),
      tools: [],
    },
  ])
    for (const enabled of [true, false]) {
      const result = prepare(raw, { enabled, budget: 8000 });
      assert.deepEqual(result.request, JSON.parse(JSON.stringify(raw)));
      assert.notEqual(result.request.events, raw.events);
    }
});
test("latest edit, command and failure ledger entries retain their exact audit retrieval offsets", () => {
  const events = Array.from({ length: 100 }, (_, i) => observation(i));
  events[15] = {
    kind: "observation",
    value: {
      id: "old-edit",
      tool: "write_file",
      ok: true,
      result: { path: "old.js" },
    },
  };
  events[75] = {
    kind: "observation",
    value: {
      id: "new-edit",
      tool: "replace_text",
      ok: true,
      result: { path: "new.js" },
    },
  };
  events[80] = {
    kind: "observation",
    value: {
      id: "failed-command",
      tool: "run_command",
      ok: true,
      result: { exitCode: 2 },
    },
  };
  events[90] = {
    kind: "observation",
    value: {
      id: "new-command",
      tool: "run_script",
      ok: true,
      result: { exitCode: 0 },
    },
  };
  events[95] = {
    kind: "observation",
    value: {
      id: "failed-check",
      tool: "read_file",
      ok: true,
      checks: { passed: false },
      result: { text: "Unexpected content" },
    },
  };
  const ledger = prepare(request(events), { budget: 8000 }).metadata.ledger;
  assert.equal(ledger.lastEdit.callId, "new-edit");
  assert.equal(ledger.lastEdit.path, "new.js");
  assert.equal(ledger.lastCommand.callId, "new-command");
  assert.equal(ledger.lastCommand.exitCode, 0);
  assert.equal(ledger.lastFailure.callId, "failed-check");
  for (const [key, index] of [
    ["lastEdit", 75],
    ["lastCommand", 90],
    ["lastFailure", 95],
  ])
    assert.deepEqual(ledger[key].read, {
      tool: "read_history",
      args: { offset: index, limit: 1 },
    });
});
