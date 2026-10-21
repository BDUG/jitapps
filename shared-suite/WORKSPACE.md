# Workspace tools across the suite

Every editor now has **Workspace** beside the shared virtual disk controls, including codeiX, vidiX and sketchiX's two sub-editors. Use **Ctrl+K / Cmd+K** to open its command palette. The tools run locally and do not require an AI provider.

## Commands

Search for an editor action, find/replace, recovery, inspection, handoff export or another app. Press Enter to choose the first result, or use Tab to navigate. Native commands keep the editor's existing confirmations and behavior. The shortcut yields to other open dialogs. Workspace tabs support arrow keys, Home and End.

## Find and replace

Search names, labels, text, descriptions, notes and other editable text. Results show document paths and excerpts; the first 100 matches are displayed with the total count. Searches use literal text rather than regular expressions and optionally match case.

Enter replacement text and choose **Preview replacement**. Rich-text HTML and SVG use text-node replacement by default, preserving markup, attributes, links and styling. Matches remain within individual text nodes/fields; phrases split across formatting boundaries are not combined. Replacement text is inserted as text, not executable markup.

**Include raw source and formulas** also searches file contents, JavaScript, CSS, HTML/SVG source and formula strings. This is selected initially in codeiX and appiX. Raw markup replacement can change identifiers inside that markup; inspect its preview carefully. Structured IDs, paths, graph references, embedded media, imported asset metadata, evidence libraries and custom validation scripts are outside bulk replacement. A full schema/reference validation still runs before application.

Inspect changed fields, then **Apply reviewed changes**. If content has changed since the preview, application is blocked. A named recovery point is saved before replacement or restoration. Invalid edits leave the current document untouched. A storage error or full recovery store blocks application, so it cannot overwrite content without preserving the prior document.

## Named recovery points and portable backups

Under **Recovery**, name and save a point before a substantial edit. Points persist in a separate IndexedDB database in this browser and origin. Restore is previewed and validated. Download or delete individual points. Each editor has up to 30 points and each document can be at most 50 MiB; delete older points explicitly when full. Nothing is silently pruned. Browser storage quota and data clearing still apply—export important backups.

**Export workspace backup** creates a versioned JSON envelope with the exact editor identity and its native document. **Open workspace backup** accepts it from **Local disk** or **Virtual disk**, previews changes, and validates before applying. A backup for another tool or another sketchiX sub-editor is rejected. These are separate from the editor's normal interchange formats; use Workspace to open a `.workspace.json` backup. The complete document is downloadable even when long fields are shortened in the on-screen change preview.

Native content is preserved rather than approximated using an AI proposal:

- **Architex:** both models and custom rule library. New/changed scripts remain disabled; unchanged existing enabled scripts can retain their status. Normal connection/validation safeguards still apply.
- **vidiX:** full project and embedded source assets, including assets currently unused by clips. AI chat still receives media metadata through its normal adapter.
- **reportiX:** the entire research question, brief, collected source library, selections, current report, evidence snapshot, research log and research settings. Restoring does not crawl or compile a report.
- **codeiX:** complete project files. Restore disconnects a linked OS directory, following native project import; it never writes files to that directory automatically. Reconnect and explicitly write when appropriate.
- **Other editors:** their validated native editable document. Content restore uses the editor's normal history where available. A recovery copy also remains available independently of native Undo.

Restoring appiX content stops its preview; the user must run it explicitly. Restoration never starts code previews, automation runs, media exports or external commands. Existing enabled Architex validation rules still follow the editor’s normal validation lifecycle. Active editor operations, source imports/exports, network calls and gestures block replacement/restoration until finished.

## AI workflows

Each of the 13 apps has three task-specific workflows: review, extension and preparation for interchange. sketchiX's sketch/shape editors have their own three workflows. Choose **Use in chat** to append a draft to the existing prompt, preserving any text already entered. It does not send the request. Drafts include acceptance criteria and preservation/verification guidance; edit them, send them through the existing relay, then review any proposed edits as usual.

Examples include formula audits and dashboards in sheetiX, architecture impact and consistent two-model edits in Architex, evidence review in reportiX, clip timing/export budgets in vidiX, and accessible self-contained app changes in appiX. These are prompts, not claims that an AI or external operation already ran.

## Inspect and share

Inspect document size, collections, strings, embedded asset counts and native structure. Tool-specific read-only insights include:

| App | Additional measurements |
| --- | --- |
| Architex | Components, dependencies, instances, data connections and custom rules |
| graphiX | Vector elements, groups, paths, text and reusable references |
| textiX | Words, headings, tables, images, links and reading time |
| sheetiX | Sheets, stored cells, formulas and styled cells |
| codeiX | Files, source lines, TODO/FIXME markers and UTF-8 bytes |
| appiX | HTML/CSS/JavaScript line counts and brief words |
| automatextiX | Steps, edges, AI calls, web calls and command steps |
| reportiX | Collected/selected sources, report evidence, report presence and question words |
| presentiX | Slides, objects, images, speaker notes and text words |
| sketchiX | Nodes, connections, UML objects and images; sub-editors show artwork geometry counts |
| mindiX | Topics, primary branches, relationships, images, ownership and dates |
| projectiX | Tasks, milestones, dependencies, critical leaf tasks and calculated finish |
| vidiX | Layers, assets, duration, frame rate, GIF frame budget and resolution |

**Validate document** runs structural validation, without executing arbitrary code, external calls, workflows, previews or all domain-specific checks. Use the editor's validation/evaluation tools for those. **Export inspection report** saves the current measurements and format notes as Markdown to either disk.

**Download schemas** exports the native document contract and the tool's AI schema/context where available. Some native backup contracts are described rather than formal JSON Schemas; the tool's runtime validator remains authoritative.

**Export agent handoff ZIP** creates:

- `workspace.json`: portable native document backup.
- `agent-context.json`: context and selection according to the editor's existing AI handover policy.
- `schemas.json`: native/AI contract information.
- `AGENT-HANDOFF.md`: a spec-driven template with goal, requirements, tool instructions, acceptance/verification guidance and the return path.

Edit the goal and requirements before giving the archive to an agent. The archive is not a live chat request and contains no valid current request IDs. Provider settings and chat logs are excluded; project source and imported media can be included in the native backup. Choose the normal suite export destination for local or virtual disk delivery. Use the neighboring app links and normal compatible export formats to transfer content between different tools.

## Verify

Start the suite on port 8000, then run:

```sh
node shared-suite/workspace-core-test.cjs
node shared-suite/workspace-browser-test.cjs
node shared-suite/workspace-native-browser-test.cjs
node shared-suite/browser-test.cjs
```

The workspace browser test exercises all 13 apps and both sketchiX sub-editors: palette, validation/insights, persistent recovery and native restoration, downloadable handoffs and non-sending AI drafts. It also checks sanitized text replacement/import, stale-preview protection, cross-tool isolation, point quotas and mobile layout. Existing shared disk, AI and native editor tests remain relevant. No live provider or external execution is needed for these checks.
