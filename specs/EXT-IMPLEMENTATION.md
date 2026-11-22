# Extension pack implementation and acceptance map

The normative request is [EXT-SPEC v1.2](EXT-SPEC.md). Implementation is the opt-in
[Python extension host](../codingagentlib/extension_pack/README.md), not a rewrite
of the Python, JavaScript or Rust execution loops. The public SDK remains the
execution/streaming/transport authority. This map describes concrete acceptance
coverage; production deployment evidence is separate.

| Requirement | Implementation | Authoritative acceptance checks in `codingagentlib.test_extension_pack` |
| --- | --- | --- |
| Constitution: reuse/public surfaces/isolation | `adapter.py` composes `CoreAgent` options and documented callbacks; disabled adapter creates no state | `test_disabled_is_identity_and_no_storage`, `test_shared_host_conformance_loaded_and_unloaded` |
| AC-1.1 durable approval | `durability.py` transactional session/checkpoint storage with kernel leases; `gateway.py` exact single-use approval | `test_process_kill_releases_lease_and_durable_approval`, `test_approval_survives_reopen_and_exact_resume` |
| AC-1.2 checkpoint branch/replay | `CheckpointStore.checkpoints/fork` creates a new host-resumable session preserving verified receipts; uncertain calls excluded | `test_checkpoint_fork_does_not_repeat_verified_tool`; external side effects require matching source/artifact restore |
| AC-2.1 verification lattice | `verification.py` per-session current-source receipts; `Gateway.authorize/complete` block configured PR/completion gates | `test_verification_current_session_and_drift`, `test_verification_escalation_can_resume_only_after_green` |
| AC-2.2 personas preserve overrides | `agents/*.md`, repository persona discovery, named config composition | `test_composition_preserves_overrides_and_warns` |
| AC-3.1 isolated parallel streams | `worktrees.py` owned per-task branches/worktrees with separate Git indexes; host launches its own agents | `test_worktree_overlapping_files_and_cleanup`, `test_concurrent_worktree_indexes_and_lifecycle` |
| AC-3.2 prune on merge/abort/crash | Worktree lifecycle adapter plus OS lease ownership; recovery never removes a live owner's tree | `test_worktree_overlapping_files_and_cleanup`, `test_worktree_crash_recovery` |
| AC-4.1 dynamic cards/task states | `protocols.py` `TrustedA2A` discovers cards and delegates through the existing `A2AClient` | `test_authenticated_a2a_card_task_state_and_impersonation` exercises send/get/cancel |
| AC-4.2 authenticated identity | Exact trusted card URL/identity, HTTPS or loopback, mandatory host OAuth/Bearer source and identity verifier, no redirects | same A2A test verifies authenticated discovery/task calls and rejects impersonation/missing tokens |
| AC-5.1 namespaced filtered MCP | `DomainMCP` uses existing MCP dispatcher, prefixes names and filters/redacts before serialization | `test_mcp_namespace_filter_and_host_adapter` |
| AC-5.2 code-action reduction | `Sandbox.code_action` is a single MCP action; output is data, source mounts read-only | `test_real_sandbox_and_code_action_round_trip_reduction`: equivalent outputs, 5 sequential model calls versus 2 consolidated (60% reduction) |
| AC-6.1 hard budgets/warnings | `routing.py` persistent conservative input/max-output and monetary reservations, explicit fast/reasoning tiers, shared checkpoint lineage ledger | `test_cost_reservations_and_routing_survive_restart`, `test_tier_money_warning_and_restart_lineage` |
| AC-7.1 policy/audit | File policy; pre-tool authorization, unapproved write gating, exact approvals, append-only hash-chain audit | `test_policy_destructive_headless_and_conflict` and approval/audit tests; raw shell destructive patterns are denied |
| AC-7.2 pre-context redaction | `Gateway.wrap_tool` redacts callback values/errors before SDK persistence/model context; audit/event redaction | `test_redaction_before_context_and_audit` |
| AC-7.3 escalation | Persistent structured `ask-for-help`, retry threshold, explicit conflict reporting and trusted operator resolution | `test_retry_escalates_without_model_loop`, verification escalation test |
| AC-8.1 progressive skills/disable | `conventions.py` metadata matching, explicit full load and disabled skill set | `test_conventions_fresh_clone_progressive_cap_and_memory` |
| AC-8.2 unindexed inspection | Git tracked-file inventory/history, literal text and Python AST inspection; no vector/index prerequisite | fresh repository fixture and conventions inspection checks |
| AC-8.3 bounded memory | Combined context cap of 4%, asynchronous redacted end-session persistence | conventions test and context cap assertion |
| AC-9.1 headless portability | No UI dependence; deterministic deny/allow_allowlisted; UI suppressed headlessly | `test_local_hook_p95_and_headless_ui`, approval test |
| Hook p95 <50 ms | Local file-policy decisions and redaction; remote export is asynchronous | `test_local_hook_p95_and_headless_ui` measures 100 local calls, p95 threshold 50 ms |
| Container isolation/resources | UID 65534, network none, drop capabilities, no-new-privileges, read-only source/root, bounded CPU/memory/PIDs/tmpfs/output/time | `test_real_sandbox_and_code_action_round_trip_reduction` checks UID, no-new-privileges, memory, blocked network and read-only source; `test_sandbox_deadline_survives_host_sigkill` verifies the in-container deadline after killing its host; browser test uses the same boundary |
| OTel tags/streaming | Audit exports OTLP Logs with extension/session/current checkpoint IDs; host callbacks retain telemetry | audit assertions; adapter emits initial AG-UI snapshot and deltas, A2UI v0.8 surface/render messages |

## Verification scope and operational contracts

- The extension is opt-in in the Python host. No unsupported JavaScript/Rust parity
  or third-party SessionConfig compatibility is implied. Missing optional host
  surfaces warn; explicit `core_options` uses actual current public SDK APIs.
- Checkpoints preserve agent state. Restoring source/databases/external side effects
  is the operator/host's artifact-snapshot responsibility, not an automatic replay
  of previously verified actions. Uncertain calls remain paused under host control.
- Model callback output limits, exact tokenizer/prices, OAuth identity validation,
  scanner runners and agent-review callbacks are trusted host dependencies. The
  extension reserves declared upper bounds and denies missing verification evidence.
- Local append-only SQL triggers/hash chains do not make a machine's disk WORM.
  A trusted external audit sink supplies that trust boundary when required.
- Actual Docker/browser/code-action evidence is produced only when
  `TLAL_EXTENSION_SANDBOX_IMAGE` supplies a reviewed, digest-pinned image; otherwise
  those tests explicitly skip. The default SDK needs no Docker or browser.
- See [APPS-STATUS-REPORT](APPS-STATUS-REPORT.md) for exact executed commands/counts.
