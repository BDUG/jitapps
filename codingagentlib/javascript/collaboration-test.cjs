const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("./collaboration.js");
const coordinator = { id: "lead@1", profileId: "lead", modalities: ["text"] };
const members = [
  { id: "a@1", profileId: "a", role: "solver", modalities: ["text"] },
  { id: "b@1", profileId: "b", role: "critic", modalities: ["text"] },
];
const policy = {
  mode: "adaptive",
  coordinator,
  members,
  maxConsultations: 2,
  interval: 5,
};
const request = () => ({
  sessionId: "s",
  step: 1,
  goal: "Build a game",
  events: [],
  tasks: [],
  responseSchema: { required: ["sessionId", "step", "action"] },
  permissions: { allowCommands: false },
});
const feedback = (name) =>
  JSON.stringify({
    recommendation: name,
    risks: ["Check input bounds"],
    checks: ["Test win and loss cases"],
    disagreements: [],
  });
function host(req, options = {}) {
  const records = [],
    calls = [];
  return {
    records,
    calls,
    options: {
      policy,
      coordinator,
      record: async (value) => records.push({ kind: "user", value }),
      current: async () => ({ status: "running", events: req.events }),
      consult: async (probe, role) => {
        calls.push({ probe, role });
        return feedback(role.role);
      },
      ...options,
    },
  };
}
test("off keeps the exact request and makes no provider or persistence calls", async () => {
  const req = request(),
    h = host(req, { policy: { mode: "off" } });
  assert.equal(await C.discuss(req, h.options), req);
  assert.equal(h.calls.length, 0);
  assert.equal(h.records.length, 0);
});
test("solvers and critics interact, keep schemas/permissions, and retry from persisted advice", async () => {
  const req = request(),
    original = JSON.stringify(req),
    h = host(req);
  const result = await C.discuss(req, h.options);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].role.role, "solver");
  assert.equal(h.calls[1].role.role, "critic");
  assert.equal(
    h.calls[1].probe.discussion[0].feedback.recommendation,
    "solver",
  );
  assert.deepEqual(h.calls[1].probe.request.responseSchema, req.responseSchema);
  assert.deepEqual(result.permissions, { allowCommands: false });
  assert.equal(result.modelCollaboration.discussion.length, 2);
  assert.equal(JSON.stringify(req), original);
  const resumed = { ...req, events: h.records },
    again = await C.discuss(resumed, {
      ...h.options,
      current: async () => ({ status: "running", events: resumed.events }),
    });
  assert.equal(h.calls.length, 2);
  assert.equal(again.modelCollaboration.reused, true);
  await assert.rejects(
    C.discuss(resumed, {
      ...h.options,
      policy: { ...policy, maxConsultations: 1 },
    }),
    /configuration changed/,
  );
});
test("adaptive ordinary steps skip calls; failures prioritize critics and obey budget", async () => {
  const req = {
      ...request(),
      step: 3,
      events: [
        {
          kind: "observation",
          value: { id: "read", tool: "read_file", ok: true, result: {} },
        },
      ],
    },
    h = host(req);
  assert.equal((await C.discuss(req, h.options)).modelCollaboration, undefined);
  assert.equal(h.calls.length, 0);
  req.events.push({
    kind: "observation",
    value: {
      id: "fail",
      tool: "run_command",
      ok: true,
      result: { exitCode: 1 },
    },
  });
  await C.discuss(req, {
    ...h.options,
    policy: { ...policy, maxConsultations: 1 },
  });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].role.role, "critic");
});
test("unsupported media and coordinator are skipped; invalid advisors cannot become actions", async () => {
  const req = request();
  req.events = [
    {
      kind: "user",
      value: {
        status: "reference_files",
        attachments: [
          {
            name: "picture.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,AA==",
          },
        ],
      },
    },
  ];
  const h = host(req);
  const result = await C.discuss(req, h.options);
  assert.equal(h.calls.length, 0);
  assert.equal(result.modelCollaboration.skipped.length, 2);
  const plain = request(),
    invalid = host(plain, {
      consult: async () =>
        '{"recommendation":"Execute","action":{"tool":"run_command"}}',
    });
  const rejected = await C.discuss(plain, invalid.options);
  assert.equal(rejected.modelCollaboration.failures.length, 2);
  assert.equal(rejected.modelCollaboration.discussion.length, 0);
  assert.equal(rejected.action, undefined);
});
test("cancelled and stale discussions are not persisted as successful rounds", async () => {
  const req = request(),
    abort = new AbortController(),
    h = host(req, {
      signal: abort.signal,
      consult: async () => {
        abort.abort();
        return feedback("Do not use");
      },
    });
  await assert.rejects(C.discuss(req, h.options), /stopped/);
  assert.equal(
    h.records.filter((e) => e.value.status === "model_collaboration_round")
      .length,
    0,
  );
  const stale = host(req, {
    current: async () => ({
      status: "running",
      events: [
        { kind: "user", value: { status: "follow_up", text: "Changed goal" } },
      ],
    }),
  });
  await assert.rejects(C.discuss(req, stale.options), /context changed/);
  assert.equal(
    stale.records.filter((e) => e.value.status === "model_collaboration_round")
      .length,
    0,
  );
});
test("response repair consults critics, new snapshots invalidate reuse, and every-step mode has distinct checkpoints", () => {
  const req = { ...request(), responseRepair: { error: "Invalid plan" } };
  assert.equal(C.trigger(req, policy).reason, "response recovery");
  assert.notEqual(
    C.trigger({ ...req, appEditing: { snapshot: "a" } }, policy).key,
    C.trigger({ ...req, appEditing: { snapshot: "b" } }, policy).key,
  );
  assert.notEqual(
    C.trigger({ ...req, step: 2 }, { ...policy, mode: "always" }).key,
    C.trigger({ ...req, step: 3 }, { ...policy, mode: "always" }).key,
  );
});
test("profile revision failures pause instead of silently dropping a changed member", async () => {
  const req = request(),
    h = host(req, {
      consult: async () => {
        const error = Error("Saved model profile changed");
        error.code = "model_configuration_changed";
        throw error;
      },
    });
  await assert.rejects(C.discuss(req, h.options), /profile changed/);
  assert.equal(
    h.records.filter(
      (event) => event.value.status === "model_collaboration_round",
    ).length,
    0,
  );
});
test("peer rotation respects role priority and never exceeds the configured call budget", async () => {
  const req = {
    ...request(),
    step: 2,
    events: [
      {
        kind: "observation",
        value: {
          id: "failure",
          tool: "run_command",
          ok: true,
          result: { exitCode: 1 },
        },
      },
    ],
  };
  const pool = [
    ...members,
    { id: "c@1", profileId: "c", role: "critic", modalities: ["text"] },
  ];
  const h = host(req, {
    policy: { ...policy, members: pool, maxConsultations: 2 },
  });
  await C.discuss(req, h.options);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].role.profileId, "c");
  assert.equal(h.calls[1].role.role, "solver");
  assert.equal(new Set(h.calls.map((call) => call.role.id)).size, 2);
});

test("prepares invariant context once while isolating peer inputs and preserving feedback", async () => {
  const req = request();
  req.events = [{ kind: "user", value: { text: "original" } }];
  let preparations = 0;
  const h = host(req, {
    prepareRequest: (value) => {
      preparations++;
      return {
        ...value,
        events: [{ kind: "user", value: { text: "prepared" } }],
      };
    },
    consult: async (probe, member) => {
      assert.equal(probe.request.events[0].value.text, "prepared");
      assert.deepEqual(probe.request.responseSchema, req.responseSchema);
      assert.equal(probe.discussion.length, member.role === "critic" ? 1 : 0);
      probe.request.events[0].value.text = "peer mutation";
      return feedback(member.role);
    },
  });
  const result = await C.discuss(req, h.options);
  assert.equal(preparations, 1);
  assert.equal(result.modelCollaboration.discussion.length, 2);
  assert.equal(req.events[0].value.text, "original");
  await C.discuss({ ...req, events: [...req.events, ...h.records] }, h.options);
  assert.equal(preparations, 1, "cached rounds do not prepare context again");
  const off = host(req, {
    policy: { mode: "off" },
    prepareRequest: () => {
      throw Error("unnecessary work");
    },
  });
  assert.equal(await C.discuss(req, off.options), req);
});
