# Evidence-driven model handoff

This optional host policy adapts [AgentBaton](https://arxiv.org/html/2610.35959v1): a primary model establishes an implementation, then an efficient continuation model can finish localized work. It is a one-time handoff, not per-turn routing, a parallel-agent system, or an automatic retry of failed commands. This implementation uses a separately prompted readiness evaluator, not the paper's trained detector. Cost or accuracy gains have not been established for this suite.

## Configure the browser coding agent

1. Open **AI provider settings** from the desktop. Create and save a primary and a continuation provider profile, each with its endpoint, model and credentials.
2. Set each profile's **Declared input support** to formats the model actually accepts. Text is the default; image, audio and PDF/file support are explicit declarations, not capability probes.
3. Under **Coding-agent model handoff**, choose primary and continuation profiles. Optionally select a separate readiness evaluator; otherwise a separate call to the primary model evaluates readiness.
4. Start with **Shadow · evaluate only**, then **Save handoff settings**. No continuation profile means normal single-model behavior, with no detector calls.
5. Inspect the coding-agent role indicator and saved readiness decisions. After evaluating your model pair, select **Automatic · one handoff** for new sessions.

These settings apply to shared coding-agent tabs across the apps. Ordinary AI chat and shelliX's separate shell loop retain their existing provider behavior. Keys stay in the relay's private profile store. Selecting roles does not change tools, command allowlists, run approvals or completion requirements. Relay imports/exports include the handoff settings. Ordinary exports still omit API keys.

A saved relay configuration can include:

```json
{
  "agentHandoff": {
    "mode": "shadow",
    "primaryProfileId": "strong-profile",
    "continuationProfileId": "efficient-profile",
    "detectorProfileId": ""
  }
}
```

Each ID must refer to a profile in the same configuration. The primary can be empty to use the active profile; continuation empty disables routing. Use explicit primary selection when regularly changing the relay's active profile. Profile `inputModalities` is an array drawn from `text`, `image`, `audio`, `file`.

## Configure the standalone VS Code extension

**Configure Model Provider** now asks for the role: primary, continuation or readiness evaluator. The primary retains the existing endpoint/model/transport settings. Additional roles use `codingagent.handoffContinuation` and `codingagent.handoffDetector`; credentials use the existing origin-bound SecretStorage. A relay role also needs its saved profile ID. Different keys at the same provider origin still share the existing origin-bound key slot.

The **Model handoff** button opens native settings. `codingagent.handoffMode` accepts `off`, `shadow` (default) or `auto`. No configured continuation means no evaluator calls. A machine-level example:

```json
{
  "codingagent.handoffMode": "shadow",
  "codingagent.handoffContinuation": {
    "endpoint": "http://127.0.0.1:4000/v1/chat/completions",
    "model": "your-efficient-model",
    "transport": "openai",
    "inputModalities": ["text", "image"]
  }
}
```

Do not put API keys in these objects. Empty `handoffDetector` reuses the primary through a distinct evaluator request. The active role/model ID appears in run details and trace; provider-attempt events identify detector versus planning calls. A detector call consumes the same request timeout/retry settings and may incur cost.

## Readiness and execution boundaries

The first release is deliberately conservative. A qualifying sequence requires a successful workspace file-tool write, replacement, edit batch or restoration, followed by a completed command/script receipt. File-tool receipts provide exact path/hash provenance. Pure planning, command-only changes without file-tool evidence, and browser `apply_project` changes do not qualify. A server command cannot certify a separate browser project just because it followed a browser edit.

The readiness evaluator receives the original goal, user follow-ups, repository instructions, task state, permissions, and bounded tool-input/source and command-output previews with explicit coverage notes. It must classify the artifact and feedback as relevant to the task, cite exact artifact/feedback call IDs, and describe remaining work using `repair`, `validate`, `harden`, or `finalize` categories. A failed test can qualify if it localizes a defect; environment failures and unrelated checks must not. This relevance judgment is model supplied, not a deterministic proof.

Missing receipts, malformed replies, wrong citations, unsupported continuation input formats, and evaluator/transport errors retain the primary model. Cancellation stops routing. The same artifact/feedback pair is not evaluated repeatedly. New follow-up instructions require new evidence before an initial handoff. Stale or unavailable source-bound verification blocks a readiness opportunity. Source freshness remains bounded to inspected/edited files, as documented separately.

The native audit records `model_handoff_policy`, `model_handoff_decision`, and, in automatic mode, one `model_handoff` transition. Dedicated `handoff_event` metadata writes preserve the reserved native turn. No detector output is submitted as a tool action. Policy persistence must succeed before switching.

The workspace, native session ID, reserved step, command review, file hashes, loop/failure budgets and completion checks remain unchanged. The handoff brief adds goal, remaining work, source/evidence references and original history offsets; full history remains accessible through `read_history`. Native multimodal attachments remain in their normal transport and session storage. Attaching an unsupported modality after a switch pauses with an explanation; it does not silently drop the reference or switch back.

Role identity and mode are frozen in configured sessions. A changed configuration requires restoring the original role configuration or starting a new run. Relay browser calls also carry a profile revision, rejecting a profile changed between policy loading and request dispatch. VS Code's direct role IDs hash endpoint, transport, model and declared input support. An existing external relay profile can still change independently of a VS Code local role; manage that external profile consistently. Native SDK hosts must give each model configuration a stable versioned ID and change it when the actual configuration changes.

## JavaScript integration

The provider-independent module is `javascript/handoff.js`, also available as `SuiteAgentHandoff` in browsers. Its `route` method wraps a host planning callback:

```js
const H = require('./codingagentlib/javascript/handoff.js');
const reply = await H.route(request, {
  policy: {
    mode: 'shadow',
    primary: { id: 'primary-v1', modalities: ['text'] },
    continuation: { id: 'efficient-v1', modalities: ['text'] }
  },
  model: (request, role, signal) => clients[role?.id || 'primary-v1'](request, signal),
  detect: (probe, role, signal) => readinessClient(probe, signal),
  record: value => runtime.dispatch({op:'handoff_event',session:request.sessionId,value}),
  current: () => runtime.dispatch({op:'session',session:request.sessionId}),
  signal,
  notify: event => console.log(event)
});
```

`detect` returns readiness JSON, never an agent action. It can integrate a future trained detector. Call the router before compressing history so evidence offsets refer to original events. Supply `current` to check that no new instructions or tool observations arrived during evaluation; the built-in browser, VS Code, Python and Rust integrations perform this check. It does not create an atomic filesystem snapshot. Do not send a full JSON request to a provider endpoint directly: use the existing transport adapter and preserve native media parts. The VS Code build bundles the canonical module into the extension; it needs no suite server or Python.

## Python integration

```python
from codingagentlib import Agent, ModelHandoff

handoff = ModelHandoff(
    efficient_model,
    detector=readiness_model,
    mode='shadow',
    primary_id='primary-v1',
    continuation_id='efficient-v1',
    continuation_modalities=('text', 'image'),
)
with Agent('/path/to/workspace', ['python3']) as agent:
    result = agent.run('Implement and verify the feature', primary_model,
                       handoff=handoff, allow_edits=True, allow_commands=True)
    # On a later process, reconstruct the same policy and callbacks:
    # agent.run(original_goal, primary_model, session_id=saved_id, handoff=handoff)
```

Callbacks receive structured requests. The readiness callback receives `purpose: handoff-readiness`, instructions and evidence; return an object such as:

```json
{
  "ready": true,
  "reason": "Implementation has been exercised; one targeted repair remains.",
  "artifactCallId": "exact-artifact-call-id",
  "feedbackCallId": "exact-command-call-id",
  "remainingWork": [{"task": "Fix the reproduced boundary case", "kind": "repair"}]
}
```

When `detector` is omitted, the primary callback must handle the distinct readiness request purpose. It must not treat that request as a normal planning turn.

## Native Rust integration

```rust,ignore
use codingagentlib::{Agent, ModelHandoff, RunOptions};
use serde_json::json;

let handoff = ModelHandoff::new(
    "shadow",
    json!({"id":"primary-v1", "modalities":["text"]}),
    json!({"id":"efficient-v1", "modalities":["text"]}),
    None,
)?;
let mut agent = Agent::new(workspace, &["git", "sh"])?;
let result = agent.run_with_handoff(goal, &RunOptions { allow_edits: true, allow_commands: true, ..Default::default() }, &handoff,
    |role, request| match role {
        "primary" => primary_client(request),
        "continuation" => efficient_client(request),
        "detector" => readiness_client(request),
        _ => unreachable!(),
    })?;
// agent.resume_with_handoff(session_id, "", 500, &handoff, same_role_callback)?;
```

Rust implements the policy natively; no Python or JavaScript runtime is required. Host callbacks supply networking, credentials and model selection. `None` for the detector identity means the host should use its primary provider for a separate readiness call, or a compatible custom evaluator. Use the same versioned identities and configuration on resume.

## Evaluate before automatic rollout

The existing held-out evaluation harness accepts:

```sh
node evaluations/coding-agent/run.cjs --live --provider-config /private/providers.json \
  --handoff-mode shadow --report shadow.json
```

Compare `off` (configured primary only), `continuation` (efficient only), `shadow`, and `auto` on the same cases and repeat count. Reports include task success, duration, planning/model/tool call counts, saved handoff decisions and per-call purpose/model/usage where reported. Detector calls count toward the request budget. `costUsd` remains null: no price is guessed and local inference is not assumed free. Usage coverage depends on the upstream provider; character counts are not billed tokens. Review requests are separate from planning. No live-provider evaluations are run automatically.

Tests use controlled model responses, real local runtimes, held-out checks and browser workflows. They establish integration behavior, not model accuracy or savings. Keep shadow mode until your selected model pair meets your own success-rate and cost criteria. Training a lightweight detector is a later experiment requiring representative trajectories and held-out repositories; no trained detector or benchmark performance is claimed here.
