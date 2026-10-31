# Coding-agent capability scope

This repository provides its own coding agent. It does not embed Google Antigravity or OpenAI Codex, inherit their service entitlements, or claim feature parity. This guide records concrete implementation status for the requested workflow improvements.

| Workflow | Current implementation |
| --- | --- |
| Task preparation | Editable goal, LLM specification questionnaire, structured requirements and acceptance criteria. |
| Plan / Build / Review | Explicit new-run mode presets, visible permission summary and detailed run settings. Read-only selection cannot silently change broader saved-session permissions. |
| Code work | Workspace file inspection/editing, native app context, source/navigation tools, bounded context views and full-source retrieval. |
| Execution | Approved native commands/scripts, allowed executables, retained output, pause/stop, failures and observed verification receipts. |
| Planning and recovery | Task graphs, resumable sessions, no-progress detection, repair guidance, context restoration and incomplete-result handling. |
| Review and artifacts | Native change review/recovery, independent model review when configured, transcripts, result ZIPs, task reports and handoff drafts. |
| Reuse | Local skills, workflows, saved prompt recipes, suite-wide templates and editable document variants. |
| Persistent project knowledge | Browser/Python relay and standalone VS Code: categorized notes, sources, pinned/archived state, expiry, revision conflicts, lexical indexing, pagination, backups and explicit session-handoff capture. |
| Memory used by models | Explicit opt-in recall; bounded relevant notes, per-run query reuse, untrusted-data labels and full-note paging bound to the approved session project. No autonomous project-memory writes. |
| Standalone VS Code | Native coding, sessions, tools, review and specification preparation already exist. The shared project-memory manager now runs standalone using private, atomically replaced per-project JSON stores, a cached local token index, explicit run approval and paged native reference snapshots. No Python relay is required. |
| Browser automation | Not supplied by the new modes or memory manager. Browser verification in the repository's tests is developer validation, not an autonomous user-facing browser tool. |
| Concurrent independent agents | Not introduced here. Parallel read-only inspection and optional model discussion/review are separate existing features. |
| Hosted cloud services | No remote hosted agent, provider account login, Google integration or service deployment is created by this update. Existing configured provider/relay transports remain in use. |

Project labels organize knowledge inside a configured workspace; they are not an access-control boundary between people sharing that workspace. Recall is selective, not an exhaustive prompt dump. Backups are sensitive project data. Read [project-memory behavior and limits](../shared-agent/TECHNIQUES.md#project-memory-and-task-modes) before enabling recall.

After updating, restart the Python relay to load the new API and memory schema. Existing session memory, source files and saved workflows retain their separate behavior. Live proprietary provider services were not used for validation; model interactions in browser tests are stubbed while local workspace/memory operations use the real runtime.
