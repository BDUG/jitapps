# AI input and output paging

Every app now loads a provider-neutral paging transport, including codeiX's separate chat, both sketchiX sub-editors, workflow AI steps, and reportiX's report compiler. The relay API remains `{messages}`; provider credentials and model configuration stay on the relay.

Open **AI paging** beside the shared disk/workspace buttons to configure:

| Setting | Meaning |
| --- | --- |
| Auto (default) | Use ordinary one-call chat for requests up to four source-page lengths. Larger conversations use paging. A relay `provider_output_limit` error also triggers a fresh paged attempt. |
| Always page | Read every original input page and generate the final answer in output fragments, even for short requests. |
| Off | Keep the original single-call behavior. |
| Source page characters | Characters per source page, not a token budget. Default 12,000; configurable from 256 to 64,000. Each call also includes protocol instructions, the manifest and running notes. |
| Output fragment characters | Requested size for each output fragment. Default 6,000; configurable from 64 to 32,000. A provider output-limit error retries the current call with a smaller requested fragment/memo budget. |
| Pause every N calls | Default 10. Review progress and choose **Continue pages** or **Stop pages**. Set 0 for continuous automatic paging. This is a pause interval, not a total response/page limit. |

Settings persist in this browser/origin and affect future requests across apps. The existing provider/model token setting still applies to each provider call. Paging requires a model capable of following the JSON control protocol. Multiple calls incur provider usage/cost, so the pause control is enabled by default.

## Input pages

The transport retains the full original conversation in memory: system/tool instructions, schemas, task, document, attachments and eligible chat history. Each original message becomes an indexed resource (`m0`, `m1`, …), split into character pages without splitting Unicode surrogate pairs. Pages concatenate exactly to the original message content; none are silently dropped.

The resource directory is itself a paged `catalog` resource, so an extensive conversation history does not force a huge manifest into every call. The model receives every catalogue and source page before output begins. It acknowledges each with matching session/phase/index identifiers and compact running notes. During output it can request any original page again by resource and page index. Each provider request contains a bounded source page, notes and manifest, rather than repeating the entire accumulated conversation.

This pages **transport and model access**, not the provider's internal context window. Running notes are model-generated and can lose details; on-demand rereads expose exact originals, but do not guarantee the model will use every detail correctly. Review proposed changes against the original content. Reduce page size if a provider still rejects a call's context. Paging does not bypass browser memory, provider quotas, model capacity or the editor's own document validation limits.

## Output pages

The model emits ordered JSON envelopes containing exact text fragments and an explicit final `done` flag. The client concatenates fragment strings verbatim into one ordinary tool response. It sends only the most recent output tail and continuation notes to the next provider call, avoiding unbounded accumulated output in the next context.

The existing response parsing, request-ID/digest checks, tool schema validation, stale-document guards and review/apply behavior run **after the final fragment**. Partial responses are never presented as completed proposals or applied. reportiX compilation and workflow steps similarly receive a final reassembled response; workflow downstream steps do not receive incomplete fragments.

There is no total response length or output-page count cap in the paging transport. Each app's content/structure limits still apply to proposed documents, and workflow item/history limits still apply to workflow data. Paging doesn't make an oversized or structurally invalid project valid.

## Progress, retries and cancellation

The progress card shows input-page count, output pages and accumulated characters. Transient relay failures, unreadable pages and mismatched acknowledgments pause at the current page. Use **Retry page** to retry it without restarting successful pages. **Stop pages** or the app's normal Stop/Cancel ends the request. Workflow AI timeout settings apply per provider call when this transport is available, so a deliberate pause or a long series of successful pages does not consume one overall step timer.

**Download partial output** retains all completed output fragments, including after cancellation or protocol failure. **Download last paging session** in settings includes original messages, page/journal details, notes, completed fragments and completion/error state. These exports may contain the supplied document and attachments. Paging state is held in memory; download it before reloading. The journal is an audit/recovery file, not an automatic resume import.

Unknown source pages, nonadvancing repeated read requests and invalid output envelopes terminate safely rather than applying partial data. A finished transport may still produce an invalid final tool response; the app reports that through its normal validation/review UI. No live provider success is implied by a transport completion flag.

## Display paging

Long shared-chat and codeiX message bodies are displayed in 16,000-character pages with **Previous**, **Next**, **Show all**, and **Download full text**. The complete message remains in the conversation; this display paging does not truncate request history, raw output or proposals. Page boundaries may split Markdown formatting; **Show all** renders the full answer together. Questions, feedback and proposal review remain separate from the paged answer body.

## Protocol and verification

The instructions live in [paging-spec.js](paging-spec.js); download them from **AI paging → Download protocol**. The implementation is in [paging.js](paging.js). No relay migration is needed.

Run with Playwright/Chromium and the suite server on port 8000:

```sh
node shared-ai/paging-test.cjs
node shared-ai/paging-browser-test.cjs
node shared-ai/paging-workflow-test.cjs
BASE_URL=http://localhost:8000 node shared-ai/browser-test.cjs
node automatextiX/ai-rounds-test.cjs
node automatextiX/call-steps-test.cjs
```

Tests use deterministic provider fixtures to check complete Unicode input delivery, source rereads, exact output assembly, pauses, retry, cancellation, retained partials, output-limit recovery, display paging and reviewed edits in shared chat and codeiX. Workflow tests check reassembled typed output passed downstream and per-page timeouts. The legacy shared-chat regression suite explicitly selects Off to verify its one-call protocol; paging-specific fixtures test the new protocol. Live providers were not called; model adherence and external quotas remain provider-dependent.
