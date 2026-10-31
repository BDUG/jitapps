# Coding-agent real-model evaluations

This runner exercises the production ReAct loop and a real local runtime against the relay's active model provider. It creates a fresh temporary workspace for each case; it does not modify your repository workspace. It is opt-in because it makes provider calls and executes generated code with local permissions. A temporary directory is not an OS sandbox: run the evaluator in a container/isolated account for untrusted providers or tasks.

## Run against your configured provider

Use an existing private relay provider configuration. The runner passes its path to a temporary server; credentials are not copied into fixture files or reports.

```sh
node evaluations/coding-agent/run.cjs \
  --live \
  --provider-config /private/providers.json \
  --label my-provider-and-model \
  --review \
  --max-steps 24 \
  --timeout 300000 \
  --report /tmp/coding-agent-live.json
```

`--live` explicitly enables provider calls and local execution. Without it, the CLI refuses to run. Configure/test the provider through the normal relay settings first. JS/TS compiler navigation requires `npm ci --ignore-scripts --prefix server/code-navigation`. Optional `--embedding-dir /path/to/minilm` enables prepared local semantic memory; use `--python /path/to/venv/bin/python` for a Python environment containing its optional dependencies.

Use `--case python-add` to select one case, `--repeat 3` for repeated fresh trials, `--review` to enable the independent completion reviewer, or `--keep` to retain temporary workspace/session artifacts for debugging. These artifacts can include model output and generated code; inspect before sharing. The normal default removes them after scoring.

## Cases and scoring

The versioned [cases.json](cases.json) contains three bounded tasks:

| Case | Task | Held-out checks |
| --- | --- | --- |
| `python-add` | Repair an addition function | Negatives, zero, floats, unchanged tests/unrelated file. |
| `javascript-label` | Repair a shared text helper without breaking its caller | Trim/case behavior, caller HTML, empty input, stable exports and files. |
| `python-validation` | Add strict positive-integer validation | Valid input, booleans/floats/zero/negatives/malformed values, unchanged unrelated code/tests. |

Fixtures include public checks that fail before the repair. The evaluator—not the model—runs additional checks after the agent finishes. These checker scripts are passed directly by the runner rather than placed in the agent's file-tool workspace. OS-level access is still possible without a sandbox; this is a quality evaluation, not an adversarial isolation benchmark.

A case succeeds only when the agent reports complete, held-out executable checks pass, protected fixture/test files remain byte-for-byte unchanged, and no run error occurs. Merely rewriting tests or claiming success cannot pass these criteria. Python bytecode writes are disabled during evaluations to avoid stale same-second caches obscuring current source changes.

The runner uses the same plan validation, DAG checks, real runtime file/command tools, context compression, observations, recovery and optional reviewer as the interactive agent. Browser-document takeover is excluded because these cases target server source files. Skills use an offline temporary catalog, avoiding unrelated remote refreshes.

## Budgets and reports

Defaults are 24 planning steps, one trial per case, a five-minute agent/setup time budget and at most three model requests per allowed planning step. Each scoring command has a separate 15-second timeout. A question, budget exhaustion, provider outage or non-complete outcome is recorded rather than automatically answered or retried indefinitely.

JSON reports include:

- Case/trial IDs, provider label, fixture hash, implementation commit and dirty-tree status.
- Success, completion state, errors, held-out results and protected-file integrity.
- Elapsed time, planning steps, tool calls, model requests and reviewer verdicts.
- Submitted/returned character counts and active navigation/memory metadata.
- Explicit limitations. Token usage is `null` when the relay does not report it; character counts are not token or cost measurements.

Compare a later run against a matching baseline:

```sh
node evaluations/coding-agent/run.cjs --live \
  --provider-config /private/providers.json \
  --baseline /tmp/coding-agent-live.json \
  --report /tmp/coding-agent-next.json
```

Reports are measurements of these cases, not a general coding-ability score. Keep provider/model, settings, fixture version and trial counts visible when comparing; repeat runs to assess variability. No live-provider score is bundled or invented.

## Deterministic harness verification

```sh
node evaluations/coding-agent/test.cjs
```

This self-test supplies a local fixture provider through the real relay/runtime pipeline. It verifies a passing repair, independent review, held-out execution, detection of a deliberately modified public test, and baseline comparison. Its reports use **mode: replay** and are **not real-model evaluation results**. The negative tampering case is expected to print FAIL; the self-test passes only if that regression is detected.

## Model handoff experiments

Use `--handoff-mode off|continuation|shadow|auto` with configured relay roles to compare primary-only, continuation-only, shadow evaluation and one-way handoff. Detector requests count toward the model-call budget. Reports retain decisions and per-call role/model identity, duration and available usage; `costUsd` is null until priced externally using actual provider rates. See the [handoff guide](../../codingagentlib/MODEL_HANDOFF.md#evaluate-before-automatic-rollout). Fixture replay validates routing, not real-model quality or savings.
