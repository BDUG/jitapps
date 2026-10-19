# projectiX

An MS Project-style planning workspace in the agentic desktop suite. Build work breakdowns, link tasks, track owners/progress, inspect the critical path and work in a draggable Gantt timeline. Includes reviewed AI planning assistance, Microsoft Project XML import/export, and draw.io, SVG and XLSX exports. No build or account is needed for local planning and file exchange.

## Start

From the repository root, run `python3 server/server.py`, then open `/projectiX/` on that server (default port 8000). Keep `architex/vendor/`, `sketchiX/`, `presentiX/` and `shared-ai/` beside this folder: they supply vendored Excel/ZIP support, diagram exports and AI chat. Direct `projectiX/index.html` opening supports local editing/interchange; same-origin HTTP hosting is recommended for AI.

## Plan and edit

**＋ Task** adds a sibling task, **＋ Subtask** adds work under the selection, **＋ Phase** creates a summary, and **◇ Milestone** creates a zero-duration task. The table shows WBS numbers, names, working-day durations, dates, completion, owner and predecessors. Select a row and click **Edit task**, double-click the row, or press F2. The same dialog works on small screens.

The dialog edits duration, percent complete, owner/resource label, notes, minimum/earliest-start date, parent and predecessors. Add dependency rows, select another task, choose a type and set signed lag in working days:

| Type | Constraint |
| --- | --- |
| FS | Successor starts after predecessor finishes, plus lag. |
| SS | Successor starts after predecessor starts, plus lag. |
| FF | Successor finishes after predecessor finishes, plus lag. |
| SF | Successor finishes after predecessor starts, plus lag. |

Positive lag delays work; negative lag permits overlap. Cycles, missing references and self-links are rejected before changes apply. Dependencies connect leaf tasks/milestones; summary-phase dependencies are unsupported. Remove links before turning a linked leaf into a phase.

Phases roll up children's start, finish, duration span and duration-weighted progress. Edit their subtasks instead of directly setting summary duration/progress. Indent makes the previous sibling a parent; Outdent moves to the parent's level. ↑/↓ reorder siblings and update WBS labels. Delete confirms subtree removal and also removes incident dependencies; Undo restores them. Empty explicit phases remain phases, not ordinary tasks.

Use **Project start** to change the plan's base date. **Days / Weeks / Months** change the working-day timeline zoom; horizontal scrolling handles longer plans. Drag a task/milestone bar to set its earliest start; dependencies may prevent moving earlier than their constraints. Drag a task's right handle to change duration. Summary bars are calculated and cannot be dragged. Earliest-start dates can be cleared in the editor to let a task move earlier again.

Phase arrows collapse/expand table rows. Search finds task names, owners and notes, including collapsed tasks. These are view operations; exports include the full plan. The critical-path checkbox highlights zero-slack tasks and milestones. The selected-task panel shows computed slack, dates and notes. Dependency lines are shown when both rows are visible.

Undo/Redo (Ctrl/Command Z / Shift Z) cover edits, imports, bar changes and AI proposals. History is session-only; the project autosaves in browser storage. Clearing browser data removes it. Export JSON regularly; it preserves all supported project fields. New projects and deletions require confirmation; invalid imports leave the current project intact.

## Scheduling scope

The scheduler uses **Monday–Friday, eight hours/day**, without holidays, lunch breaks or resource leveling. Starts move to the next working day; durations and dependency lag use whole working days. Scheduling is forward from project start and optional earliest-start dates. Summary rollups and critical/slack calculations use the dependency graph and its current calculated finish.

Dates are day-based and calculated in UTC internally to avoid daylight-saving shifts. Exported Project XML uses floating local work times of 09:00–17:00. A task finishing at a workday boundary and its following milestone can share a business-time boundary across the next working morning; milestone and project finish dates include that boundary correctly.

Owner names are labels, not availability/capacity calendars. There are no costs, budgets, baselines, actual work/remaining effort, custom holidays/calendars, elapsed-time tasks, task splits, multiple resource units, recurring tasks or resource-conflict resolution. Completion percentages do not reschedule remaining work. Critical flags reflect this simplified dependency model, not every advanced Microsoft Project constraint.

Limits: 500 tasks/phases, 30 outline levels, 0–1,000 whole working days per task, lag ±1,000 days, 200-character task names, 10,000-character notes, 5 MB model JSON and a 2,600-working-day schedule horizon. Input calendar dates must be between 1900 and 2100. Projects exceeding the horizon are rejected with an explanation.

## Import and export

| Format | Support |
| --- | --- |
| Microsoft Project XML `.xml` (MSPDI) | Import/export native tasks, UID references, WBS hierarchy, milestones, durations, dates, completion, notes, named resources/assignments and FS/SS/FF/SF links with lag. Export includes a standard calendar and uses the Text1 extended field, aliased `projectiX ID`, for stable supported task IDs. |
| Excel `.xlsx` | Export **Tasks**, **Dependencies**, **Project** and a colored **Gantt** sheet. Tasks contains complete schedule data, dates, slack, critical flags and notes. The visual Gantt worksheet covers the first 260 working days; the Tasks sheet is not truncated. XLSX import is not provided. |
| SVG `.svg` | Export a standalone vector Gantt chart, all tasks/phases, milestones and dependency lines. Long labels are shortened visually with full names in SVG titles. Very long schedules can produce wide artwork. |
| draw.io `.drawio` | Export an editable dependency diagram with task/phase/milestone shapes, dates, progress, owner labels and typed/lagged connections. This is a dependency diagram, not a native Gantt grid. The diagram writer supports up to 1,000 links. |
| JSON `.json` | Full supported project backup and reopening, preserving original dates/IDs, notes and constraints. |

**Binary Microsoft Project `.mpp` files are not supported directly.** In Microsoft Project, use **Save As → XML**, then import that XML file here. Exported MSPDI XML can be opened in Microsoft Project or compatible tools. Interchange is not lossless for arbitrary Project files: custom fields beyond the ID field, calendars, resources and scheduling features outside the supported model are not carried through export. Use a copy of the original file and review the import report.

Import normalizes to the supported calendar. Fractional working-day durations round up; fractional lag rounds to the nearest working day. Imported task starts become earliest-start dates to retain source date intent; clear these in the task editor if earlier rescheduling is wanted. Fixed/finish constraints simplify, summary/cross-project links are skipped and reported, and external files are never opened. Multiple resource assignments become one owner label. XML/JSON imports are limited to 10 MB; XML with DTD/entity declarations is rejected.

## AI planning

Click **Plan with AI** or **AI chat**. Request a work breakdown, task estimates, milestones, dependency review, critical-path explanation, planning risks or note improvements. The assistant receives the complete project/hierarchy, links, owners, notes, start constraints, selected task, computed dates/slack/critical flags, scheduling rules, schemas and reference attachments.

The assistant proposes a complete replacement plan. **Review proposed edit → Apply reviewed edit** is required. IDs, parent/dependency references, cycles, durations and the schedule horizon are checked locally. Independent edits make a proposal stale and block application. Native Undo and **Undo AI edit** restore a prior plan. AI cannot execute work, contact owners or verify resource availability; generated estimates need review.

Only the relay URL is configured in this editor. Configure providers and credentials in the relay's `/relay` page. See [shared AI chat](../shared-ai/README.md) for setup, attachments, raw output, request/schema downloads, Stop and errors. Calls need valid credentials and network access from the relay machine. The 600,000-character request limit can block large note-heavy projects; reduce the project/attachments or omit document context for general questions.

## Verification

With the suite server on port 8000:

```sh
node projectiX/model-test.cjs
python3 projectiX/office-validation.py create
node projectiX/browser-test.cjs
python3 projectiX/office-validation.py validate
```

Browser tests use Playwright and `/usr/bin/chromium`. Independent tests use Java, Python `mpxj`, `JPype1` and `openpyxl` (verification dependencies only). They generate native Project XML with MPXJ, import it, then read projectiX's exported XML and XLSX with independent readers. Tests cover calendar/dependency math, lag, milestone boundaries, summaries/slack, invalid/cyclic plans, Gantt drag/resize, hierarchy, history/persistence, five file exports, atomic import rejection and mocked AI review/apply/Undo. They do not certify native Microsoft Project rendering or every scheduling feature, and do not call a paid AI provider.
