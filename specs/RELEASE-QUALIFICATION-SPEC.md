# Release qualification and measured reliability

Qualification applies to an identified source-tree digest and artifact digest,
not just a branch name or a passing unit-test count. Missing evidence remains
`not-run`, `unavailable` or `failed`; it cannot satisfy a release requirement.

## Acceptance matrix

| ID | Requirement | Required evidence |
| --- | --- | --- |
| RQ-1 | Repeated live-model repository tasks | At least three trials per case, multi-file repair, large-source inspection, failing checks, concurrent edits and process-restart recovery. Record actual provider/model identity, source/fixture digests, steps/calls/tokens, latency, integrity, false completion and per-case outcomes with uncertainty. Replay must remain labeled replay. |
| RQ-2 | Installed extension workflows | Build and install the exact VSIX into a disposable profile; exercise approval/denial, Plan/Build, cancellation, dirty files, references, restart/resume and result export. Record artifact/editor/platform identity. Linux, Windows and macOS evidence is separate. |
| RQ-3 | App format compatibility | An explicit per-app/per-format matrix with import, native edit, export and reopen checks. Preserve content and relevant styles/formulas/relationships/assets; lossy formats declare tested limitations. Every advertised format has evidence or an explicit open qualification item. |
| RQ-4 | Independent protocol interoperability | MCP, A2A and ACP clients/servers from independent SDKs; real transports; authentication, malformed requests, streaming/cancellation and reconnect/failure behavior. Pin implementation versions and record exercised protocol versions. Same-library mocks do not satisfy interoperability. |
| RQ-5 | Execution boundary acceptance | Digest-pinned Docker image, non-root identity, filesystem/network restrictions, resource/output/time limits and cleanup after host/process failures. Live generated code runs inside a container without host provider credentials or Docker socket. |
| RQ-6 | Reproducible release gates | CI and local entry points run unit, packaging, browser, platform and optional live-provider gates. Reports and packages carry provenance and are uploaded/retained as artifacts. A missing platform/live check cannot be called passed. |

## Measurement and release policy

- Synthetic fixture data may be sent to the explicitly configured provider. Never
  persist provider keys in reports, images, source snapshots or generated workspaces.
- Live trials use bounded model calls, per-case deadlines and a suite deadline.
  Record observed usage; monetary cost remains unknown unless actual prices are
  supplied. Errors and interrupted trials retain actual tool receipts.
- The initial controlled-pilot policy requires three trials per case, observed
  success rate at least 90%, zero protected-file violations and zero false-complete
  outcomes. Report confidence intervals; these small trials do not establish
  general coding ability or production-wide reliability.
- Report deterministic safety/chaos checks separately from live model scores.
  Failures must lead to a source fix, a verified environment correction or an open
  qualification issue; do not weaken a check to obtain green results.
- Release automation never publishes a package or changes the user's normal editor
  profile. Remote CI execution/publication is reported separately from local checks.

## Evidence ledger

`APPS-STATUS-REPORT.md` links current observed evidence. Machine-readable reports
must identify required checks and their individual status, commands, tool/platform
versions, source/artifact digests and explicit limitations. Qualification is only
complete when every required acceptance-matrix row is backed by adequate evidence.
