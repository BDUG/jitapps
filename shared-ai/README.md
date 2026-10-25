# Shared AI chat

Architex-style, relay-based chat for graphiX, textiX, sheetiX, automatextiX, reportiX, appiX, presentiX, sketchiX, mindiX and projectiX. codeiX keeps its existing integrated agent and now supports the same uniquely named reference attachments.

Click **AI chat** at the bottom right of a tool. Its panel is foldable and resizable, keeps a conversation for the page session, and supports questions or document editing requests. The current document is included by default; uncheck the context option for general questions. Earlier conversation turns remain included until New conversation is used. Attach images, WAV/MP3 audio, PDFs or UTF-8 text without application file-count or size limits; duplicate names receive unique suffixes. Attachments remain in the chat panel until removed or the page reloads, and are not automatically inserted into the document.

## Relay

Start `python3 server/server.py` for AI chat and web crawling. Serve the tool from that server's path. Open **Relay** in the chat, set the relay origin and test it. Provider endpoints, models and keys are configured on the relay's `/relay` page. The health check verifies the relay; test the actual provider in its own settings.

The shared panel remembers a suite relay URL in browser storage and can reuse Architex's saved relay URL initially. reportiX's chat and compiler use its existing relay setting. codeiX keeps its native relay settings. Separately hosted tools need their exact origin allowed by the relay. Direct file opening uses the `null` origin and requires appropriate relay configuration; same-origin serving is simpler.

## Context and tool-specific features

| Tool | Context and assistance | Proposed changes |
| --- | --- | --- |
| graphiX | SVG artwork and selected object; design, layout, shapes, typography, colors and explanations | Complete static SVG and document name, sanitized before review |
| sketchiX | Diagram nodes, connections, geometry/styles and selected objects; create diagrams, improve layout/labels and explain connections | Complete validated diagram, reviewed before application with reference integrity and Undo |
| mindiX | Topic hierarchy, notes, priorities/progress, styles and selected subtree; brainstorm, organize ideas and refine branches | Complete validated map with one central topic, cycle/reference checks, reviewed application and layout/Undo |
| projectiX | Project hierarchy/dependencies, notes, owners, computed schedule/slack/critical flags and selected task; plan work and review schedules | Complete validated plan with dependency/hierarchy cycle checks, local scheduling, reviewed application and Undo |
| textiX | Rich-text document and selected text; drafting, rewriting, summaries, structure, formatting and proofreading | Complete HTML body and document name, sanitized before review |
| sheetiX | Workbook, active sheet, selected range and up to 100 selected cells with calculated values; formulas, analysis, tables and formatting | Complete workbook, checked by the spreadsheet's validation |
| automatextiX | Workflow, selected node/edge, run summary and selected-step data; explanations, configuration repair, data mapping and workflow design | Complete workflow, with configuration, reference and cycle checks; never automatically executed |
| reportiX | Current report and its captured evidence, or selected sources before a report exists; discuss findings, refine wording/tables and propose evidence-based visuals | Complete report using existing source IDs; it cannot add research or invent sources |
| appiX | App brief, HTML/CSS/JavaScript, selected source and preview console; generate apps, improve interactions/accessibility and debug | Complete project replacement, reviewed before application; preview executes only on explicit Run preview |
| presentiX | Complete slide deck, elements, styles, speaker notes and active slide/object; create presentations, refine narrative and design, and draft notes | Complete validated deck, reviewed before application, with native and shared Undo |
| codeiX | Existing project agent with active file/selection, chosen project context and reference attachments | Existing per-file review/apply workflow |

Images or headers embedded in a document/workflow are part of the selected context. Choose what to share and keep credentials in the relay where possible. Neither the assistant nor this panel executes JavaScript, commands, formulas or workflows on the model's behalf. Proposed spreadsheet formulas are calculated by the spreadsheet after application, just like manual edits. Supported workflow HTTP nodes run only when the user explicitly starts the workflow.

## Review and Undo

A question produces an answer without changing the document. Editing responses must match the current request/snapshot identifiers and the tool's replacement schema. The proposed document is sanitized/validated before its review is shown. Inspect the current and proposed content, then choose **Apply reviewed edit**.

If the document changes after the request, application is blocked. Ask again using the updated document. Workflow/research edits are also blocked while the tool is executing an operation. **Undo AI edit**, below the chat in Agent call output, restores the last applied replacement only when no subsequent document change would be overwritten. The regular tool history also records applied AI edits where that tool has native Undo. reportiX uses the shared Undo AI edit because it has no general research-history Undo.

The replacement is the entire supported document, not a patch. Review omissions as well as additions. AI suggestions can contain mistakes even when they pass structural validation; report citation membership does not prove factual support.

## Handover and diagnostics

The separate [protocol.js](protocol.js) defines the spec-driven response contract. Each tool's `ai-adapter.js` provides its domain instructions, schema, context and validation/application hooks. Requests include these schemas, selected document/selection context, unique attachments, a request identifier and a document digest. Local exact-snapshot comparison protects against stale edits.

**Agent call output** is below the conversation. Expand it to inspect raw output, download the complete request or download the agent API/schema. The API export includes the protocol and tool instructions, not private implementation code or provider credentials. Conversation and attachments are session-only; downloaded requests include any document/attachments selected for that call.

Stop cancels a request. Chat requests have no automatic application timeout; use Stop to cancel. There is no application size limit on attachments or outgoing chat context. Browser memory and provider context limits still apply. Restart an updated relay to remove its former 2 MB incoming chat limit. Plain-text answers are accepted, but malformed structured proposals, mismatched identifiers and invalid documents never apply. A failed request preserves the current document.

## Verification

Serve the repository with the reportiX server on port 8010 and run:

```sh
node shared-ai/browser-test.cjs
node shared-ai/failure-browser-test.cjs
```

This tests all ten chat integrations using controlled relay responses: schema/context handover, unique attachments, questions, sanitization, review-before-apply, Undo and stale edits. Existing per-tool tests and codeiX's browser test provide regression coverage. These tests do not make a paid model call.

AI chat replies have no application response-size limit in the shared chat UI, codeiX chat or relay. Restart the relay after updating to remove the former 2 MB provider-response cap. Provider token configuration, model limits, external network timeouts and available memory still apply.

The shared chat and codeiX do not automatically abort long AI requests; the relay also waits without an application timeout. Use **Stop** to cancel in the chat. External provider/proxy timeouts can still occur. The shared chat panel scrolls on small screens so messages and controls remain reachable.


Chat result handling preserves the assistant's answer even when an edit is invalid. Validation feedback appears in a highlighted **Content was not updated** card. Continue the conversation naturally; the next request includes the validation feedback and invalid result so the assistant can correct it. A single response object can be extracted from fenced JSON alongside unrelated JSON examples; ambiguous response objects are rejected.


**Review proposed edit** shows changed document sections and before/after content. **Apply reviewed edit** validates again against the current document and updates the app through its adapter, waiting for asynchronous validation/application. **Undo AI edit** restores the preceding content if the app has not changed since application. Editing instructions explicitly require a real proposal rather than a plan.

Run `node shared-ai/results-browser-test.cjs` against the suite on port 8000 to check highlighted validation feedback, follow-up corrections, wrapped JSON, reviewed updates and identifier rejection.


The default **Questions & proposals** mode supports a continuous discussion: ask questions, request changes, ask about an unapplied proposal, then refine it. **Ask a question** forbids edits; tool-specific edit modes remain available. Full successful conversation history is retained until **New conversation**. Provider context capacity still applies.

Every request contains conversation metadata identifying pending, applied, undone, superseded and stale proposals. The latest valid pending proposal is supplied separately from the actual document, so an assistant can refine it without claiming it was applied. A new valid proposal supersedes older pending proposals; questions preserve them. Applying or undoing a proposal updates its status in subsequent requests. Changing the document-context checkbox starts a new conversation to avoid carrying excluded content in history.

Run `node shared-ai/multiturn-browser-test.cjs` with the suite on port 8000 to verify discussion, proposal refinement, apply/undo state and reset for textiX, architex and appiX.

Assistant replies may include highlighted feedback, comments and question cards with selectable options and an optional custom answer. Select an option or type your answer, then click **Use answer** to queue it below the message input. You can combine several answers, add a message, and review them before pressing Send. Proposal cards remain subject to explicit review before updating app content.

Run `node shared-ai/feedback-browser-test.cjs` to verify feedback and comment cards, selectable question options, custom answers and explicit submission on a mobile viewport.

Every AI chat includes a collapsible **Prompt fragments** list, including codeiX and sketchiX's sketch/shape editors. Choose a tool-specific extension or quality check, or common guidance to preserve unrelated work, return usable edits, clarify requirements or refine a pending proposal. Clicking inserts editable text at the message cursor (replacing only selected text); it never sends a request or applies changes. Add your concrete requirements and send when ready.

The common catalogue and insertion UI live in [prompt-fragments.js](prompt-fragments.js). Run `node shared-ai/prompt-fragments-browser-test.cjs` with the suite on port 8000 to verify all 14 chat entry points.

Replies support optional **Intent**, **Proposed approach**, **Assumptions**, **Suggested verification**, and **Next steps** sections, plus titled comments. These are concise user-facing summaries, not internal reasoning or claims of execution. Plain answers remain compatible. Markdown headings, lists, bold text and code blocks are displayed using DOM text nodes; model-supplied HTML remains inert. Long code blocks scroll and replies have no display-length cap. Reading older messages preserves the scroll position when a new turn is rendered.


Question interactions retain selected options and custom drafts when messages rerender. **Use answer** queues one answer per question without duplicating it; editing a queued answer updates that entry, and **Remove** unqueues it. **Send** can submit queued answers with or without an additional message. Successful submission marks cards **Answered**; **Revise answer** starts a revision. Failed or stopped requests retain queued answers for retry.

Questions may declare multiple:true for multi-select choices plus custom detail, and optional:true for an explicit **Skip question** action. Answers are associated with the source request ID and question ID, so repeated IDs in later turns remain distinct. Requests carry structured answers and question status alongside the conversation. Draft selections are never treated as submitted answers. New conversation clears all question state.

Run `node shared-ai/question-interactions-browser-test.cjs` to check deduplication, multi-select/custom answers, network retries, preserved drafts, revisions, repeated question IDs, optional skips and reset.

## Large conversations and response paging

Use **AI paging** in relay settings for Auto, Always page or Off, source/output page sizes and automatic pause intervals. Input pages preserve the original conversation and can be reread; output fragments are assembled before the existing validation and review flow. Progress supports retry, continuation, cancellation and partial/session downloads. Long chat answers also have display page controls. See the [paging guide](PAGING.md) for the protocol, provider context limits, settings, workflow/report integration and verification.

## Workspace coding agent

Use the **Coding agent** tab in AI chat for iterative code inspection, file editing, managed scripts and real terminal execution. See the [runtime setup and workflow](../shared-agent/README.md) for startup flags, permissions, session recovery and verification.

### Paging from relay settings

Open **Relay → Paging settings** in any chat (or **Relay settings** in codeiX). The provider administration page `/relay` also has an **AI paging** section. Set Auto / Always page / Off, source-page characters, output-fragment characters and the pause interval. Settings persist in this browser for the current origin and update already-open apps on that origin. Separate frontend addresses have separate browser settings; these values are not provider credentials or server token limits.

Paged replies now accept whole-response JSON code fences and automatically correct malformed page envelopes up to twice before offering manual retry. Corrections preserve the exact page and accepted fragments, and cover identifiers, memo limits, output shape and source references. See [PAGING.md](PAGING.md) for recovery and journal details.

Paged calls now also retry temporary network/provider failures up to twice with cancellable backoff, respect short Retry-After delays, and repair repeated source-read loops or premature empty completion. Long provider-requested waits and authentication failures retain manual control.

Before finishing a paged structured response, the client checks assembled JSON, required top-level fields and current request identifiers. It repairs the final fragment first; if an earlier malformed prefix prevents recovery, it can restart output once from retained source pages. Rejected attempts remain in the session download. Normal proposal/action validation and review still apply.

Batch pauses now count accepted paging responses, allowing repairs/retries to complete before pausing. The pager normalizes bare or JSON-encoded envelopes and transport trailing commas without changing text fragments; normalized replies still require exact IDs and valid fields. The journal records normalization details and provider-call counts.

Coding-agent planning now prefers direct compressed requests in Recommended mode. Paging controls live inline with the agent conversation and support **Use partial reply**; unresolvable protocol replies trigger direct replanning automatically. After Stop, **Use retained partial as follow-up** prepares an editable recovery draft. Partial text never becomes an executable action without a fresh validated agent response. Existing shared-chat/workflow paging behavior remains complete-result only.

## Multimodal references and results

See the [multimodal guide](MULTIMODAL.md) for supported input types, provider adapters, response media previews/downloads, direct-transport behavior, and coding-agent reference persistence. Media never bypasses project validation or proposal review.
