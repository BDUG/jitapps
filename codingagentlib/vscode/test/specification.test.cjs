const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../media/specification.js"),
  { complete } = require("../src/provider.cjs");
const fixture = () => ({
  title: "Safe file search",
  summary: "Find matching files without changing them.",
  scope: ["Workspace search"],
  nonGoals: ["No edits"],
  constraints: ["Do not execute commands"],
  requirements: [
    {
      id: "R1",
      description: "Return matching paths",
      acceptance: ["A query returns matching workspace paths."],
    },
  ],
  design: ["Use existing search UI."],
  tasks: [
    { id: "T1", title: "Inspect search integration", requirementIds: ["R1"] },
  ],
  verification: [
    {
      requirementId: "R1",
      method: "Propose a known fixture search",
      expected: "Only matching paths appear.",
    },
  ],
  openQuestions: ["Which file types?"],
  assumptions: [],
});
module.exports = { fixture };
test("specification preserves original command/answers with traceable requirements and planned checks", () => {
  const source = C.input("Search files. Do not edit anything.", {
      scope: "Only src/",
    }),
    spec = fixture(),
    before = JSON.stringify(spec),
    text = C.markdown(
      C.parse("```json\n" + JSON.stringify(spec) + "\n```"),
      source,
    );
  assert.match(text, /Search files. Do not edit anything./);
  assert.match(text, /Only src\//);
  assert.match(text, /R1/);
  assert.match(text, /T1 \(R1\)/);
  assert.match(text, /not executed/);
  assert.match(text, /Which file types/);
  assert.equal(JSON.stringify(spec), before);
});
test("invalid specification data cannot masquerade as an executable plan", () => {
  for (const value of [
    "",
    "not json",
    '{"status":"act","action":{"tool":"run_command"}}',
  ])
    assert.throws(() => C.parse(value));
  for (const change of [
    (s) => s.requirements.push({ ...s.requirements[0] }),
    (s) => (s.requirements[0].acceptance = []),
    (s) => (s.tasks[0].requirementIds = ["R2"]),
    (s) => (s.verification = []),
    (s) => (s.verification[0].requirementId = "R2"),
    (s) =>
      s.requirements.push({
        id: "R2",
        description: "Uncovered",
        acceptance: ["Check it"],
      }),
  ]) {
    const s = fixture();
    change(s);
    assert.throws(() => C.parse(s));
  }
  assert.throws(() => C.input(""), /Enter a command/);
  assert.throws(() => C.input("x".repeat(30001)), /30,000/);
  assert.throws(() => C.input("ok", { scope: "x".repeat(4001) }), /4,000/);
  assert.throws(() => C.parse("x".repeat(60001)), /60,000/);
});
test("specification provider purpose uses configured credentials without tool protocol or attachments", async () => {
  const source = C.input("Search files"),
    request = {
      purpose: "specification",
      instructions: C.instructions,
      specification: source,
    };
  const result = await complete(
    {
      endpoint: "https://model.example/chat",
      transport: "openai",
      model: "configured",
    },
    "secret-header",
    request,
    undefined,
    async (url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.model, "configured");
      assert.equal(init.headers.Authorization, "Bearer secret-header");
      assert.equal(body.messages[0].content, C.instructions.join("\n"));
      assert.ok(
        !body.messages[0].content.includes("Use exactly the sessionId"),
      );
      assert.ok(!init.body.includes("secret-header"));
      assert.deepEqual(
        JSON.parse(body.messages[1].content).specification,
        source,
      );
      assert.ok(!("tools" in body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(fixture()) } }],
        }),
      );
    },
  );
  assert.equal(C.parse(result).requirements[0].id, "R1");
});
