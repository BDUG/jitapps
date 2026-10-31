# Optional multi-model coding-agent collaboration

Restart the suite server after updating the code, then open **AI provider settings → Multi-model coding-agent collaboration**. Create saved provider profiles first (different models can use the same provider), then assign each participating profile **Solver** or **Critic**. The active provider coordinates the result; when one-way handoff is enabled, its current primary/continuation model remains the coordinator.

- **Off** is the default and makes no peer calls.
- **Adaptive** consults peers for initial planning, newly observed failures, pending verification, response recovery and every configured number of steps.
- **Every planning step** consults on each new planning turn.
- **Maximum peer calls per discussion** bounds additional calls, independently of provider token settings. Only distinct, compatible peers other than the current coordinator participate.

Start with one solver and one critic, a budget of two calls and a five-step interval. Solvers propose approaches; critics receive earlier replies and challenge assumptions, propose checks and state disagreements. The coordinator receives the discussion alongside the original task, schemas, permissions and observations, and returns the normal single-action response. On failure/verification checkpoints critics take priority; planning favors solvers. Compatible profiles rotate within each role to avoid using only the first configured member.

Review **Model collaboration** status and **Model discussion** receipts in the agent activity log. Expand a discussion to inspect each model's public recommendation, rationale, checks, risks, disagreements, unavailable providers and skipped modalities. The run log retains this metadata. Model agreement is advice, never proof of correctness: command/result checks, stale-file protection, dependency validation, independent review and project-takeover approval still apply.

## Context, persistence and failure behavior

Enabling collaboration shares the coding request and supported native references with the chosen providers. The existing context-compression policy applies and schemas remain available. Older discussion rounds are archived from the active compressed view; the latest advice and all original user references are preserved, and full rounds remain retrievable in runtime history. Advisers cannot execute tools, retrieve additional history themselves, grant permissions or apply proposals. They must report uncertainty about omitted context; the coordinator can retrieve actual files/history through the normal tools.

A run records `codingagentlib/model-collaboration/v1` policy and discussion events. Profile/model revisions are pinned. Changing the saved team configuration requires restoring it or starting a new run; provider revision errors stop rather than silently substituting a different model. Ordinary provider errors or invalid advisory replies are recorded and the coordinator continues with whatever valid feedback remains. There is no claim of consensus if peers fail.

Interrupted coordinator calls can reuse the persisted discussion for the same evidence/context checkpoint. A new reference, instruction, observation or app-context snapshot invalidates that reuse. Stop aborts in-flight calls. Changed server observations, user instructions or open-project content during discussion prevent takeover of stale advice. Metadata events do not consume the runtime's reserved planning turn or count as execution/verification evidence.

Settings are included in normal relay configuration import/export, with the existing key-inclusion controls. Example fragment (IDs must exist in `profiles`):

```json
{
  "agentCollaboration": {
    "mode": "adaptive",
    "members": [
      { "profileId": "coding-solver", "role": "solver" },
      { "profileId": "independent-critic", "role": "critic" }
    ],
    "maxConsultations": 2,
    "interval": 5
  }
}
```

Additional calls increase latency and provider usage. Choosing a model team is workload-specific; verification against real requirements determines whether a proposed solution works.

## JavaScript host integration

`javascript/collaboration.js` exports `SuiteAgentCollaboration` in browsers and CommonJS `policy`, `trigger`, `parse`, `boundary`, and `discuss` helpers. No provider SDK or credentials are built into the module.

```js
const { discuss } = require('./javascript/collaboration.js');
const enriched = await discuss(request, {
  policy: resolvedPolicy,             // stable profile revisions and input modalities
  coordinator: currentModel,
  consult: (probe, member, signal) => providerAdvisoryCall(probe, member, signal),
  record: value => runtime.dispatch({ op: 'collaboration_event', session: request.sessionId, value }),
  current: () => runtime.dispatch({ op: 'session', session: request.sessionId }),
  signal,
  notify: event => updateDiscussionStatus(event)
});
return coordinatorModel(enriched);   // normal schema validation and runtime follow
```

Hosts may supply `prepareRequest(request)` to prepare a read-only context view once per discussion. It runs only when peers will be called; disabled mode and cached rounds skip it. Each peer receives an independent deep copy of the prepared view, together with earlier feedback. The browser uses this hook to compress history and collect native references once, rather than repeating preparation for each peer. The full request remains available for modality checks and stale-context validation. This reduces local processing; provider latency and call budgets are unchanged.

`consult` returns advisory JSON with a required nonempty `recommendation` and optional `rationale`, `risks`, `checks`, `disagreements`. A reply containing an executable `action` is rejected. Treat every reply as untrusted reference data. Python and native Rust runtimes provide the `collaboration_event` persistence operation; the browser/JavaScript module owns the discussion orchestration.

## Verification

```sh
node --test codingagentlib/javascript/collaboration-test.cjs
python3 -m unittest server.collaboration_test server.handoff_test
node shared-agent/collaboration-browser-test.cjs
cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml --test collaboration
```

The browser regression uses controlled provider replies with the real provider-settings UI, configuration persistence, context assembly, runtime planning and a real workspace file read. It makes no live-provider quality or cost claims.
