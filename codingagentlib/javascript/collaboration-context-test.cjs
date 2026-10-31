const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("./context.js");
test("collaboration history is archived without losing current advice, user references or schemas", () => {
  const reference = {
    kind: "user",
    value: {
      status: "follow_up",
      text: "Preserve the actual requirements",
      attachments: [
        {
          name: "requirements.txt",
          kind: "text",
          content: "Exact user content",
        },
      ],
    },
  };
  const rounds = Array.from({ length: 80 }, (_, i) => ({
    kind: "user",
    index: i + 1,
    value: {
      format: "codingagentlib/model-collaboration/v1",
      status: "model_collaboration_round",
      step: i + 1,
      reason: "checkpoint",
      discussion: [
        {
          feedback: { recommendation: "Advice " + i + " " + ".".repeat(3000) },
        },
      ],
    },
  }));
  const request = {
    events: [reference, ...rounds],
    responseSchema: { required: ["step", "action"] },
  };
  const packed = C.pack(request, { mode: "aggressive" });
  assert.deepEqual(packed.payload.events[0], reference);
  assert.deepEqual(packed.payload.responseSchema, request.responseSchema);
  assert.deepEqual(packed.payload.events.at(-1), rounds.at(-1));
  assert.ok(packed.stats.afterCharacters < packed.stats.beforeCharacters / 4);
  assert.equal(
    rounds[0].value.discussion[0].feedback.recommendation.startsWith(
      "Advice 0",
    ),
    true,
  );
  assert.equal(C.pack(request, { mode: "off" }).payload, request);
});
