# reportiX

A query-driven research and report studio in the visual style of Architex. It discovers public pages, collects readable source text, and asks an AI relay to compile a structured report with cited findings, tables and evidence-based SVG charts.

## Start the tool

From the repository root:

```sh
python3 server/server.py
```

Open the `/reportiX/` path on this server (default port 8000). The server also serves the other tools and the existing AI relay/provider settings UI. The unified backend supplies both AI chat and web research; a plain static server only displays the page.

Use `--port`, `--bind` or `--config` to select a port, bind address or existing relay provider configuration file. `--search-config` selects a separate Google search configuration file:

```sh
python3 server/server.py --port 8010 --config /path/to/providers.json --search-config /path/to/reportix-search.json
```

Keep provider configuration outside the served repository. The server's default configuration location is the same as Architex's, so an existing relay setup can be reused. See [Architex documentation](../architex/README.md). In **AI relay**, set the relay origin, save and test it; **Provider settings** opens the relay's own configuration UI. A health test checks the relay service, not a paid model call. Provider credentials stay on the server.

The crawler API is intentionally same-origin and local-host only. Serve the UI from the reportiX server; do not call it from a separate static origin. You can select a separate Architex-compatible AI relay; that relay must allow the app's exact origin. Use HTTPS for a remote AI relay, or HTTP on loopback.

## Configure Google website search

1. Obtain access to the [Google Programmable Search JSON API](https://developers.google.com/custom-search/v1/overview) for your Google Cloud project and create an API key. API availability, billing, quotas and eligibility are controlled by Google; an existing Google account alone does not guarantee API access.
2. Create or select a [Programmable Search Engine](https://programmablesearchengine.google.com/controlpanel/all) and copy its **Search engine ID** (`cx`). Results follow the sites/scope configured for that engine; they are not necessarily a search of the entire web.
3. Start the updated reportiX server. Open **Google search settings** below the provider selector, or **AI relay & search** in the header.
4. Enter the API key and engine ID, then **Save Google settings**. Leaving the key blank retains the stored key. **Remove stored key** deletes only the saved key, not an environment-provided credential.
5. Select Google, enter your query and start research. Search results enter the same public-page crawling, robots, extraction and citation pipeline as URL/Bing research. The research log records the selected provider and discovered results. Google returns up to ten results per discovery request.

Google keys are stored on the server, never in browser storage or research/report exports. The default file is `~/.config/reportix/search.json` (or under `XDG_CONFIG_HOME`), separate from AI provider configuration. Keep a custom `--search-config` outside the served repository; saved files have owner-only permissions. The settings endpoint returns only the engine ID and credential-presence flags. The key field is cleared after saving.

For server-managed configuration, set `REPORTIX_GOOGLE_API_KEY` and `REPORTIX_GOOGLE_ENGINE_ID`. Environment values override stored values; the UI identifies them. The engine ID is read-only when supplied by the environment.

The Google API endpoint is `customsearch.googleapis.com`. Enable outbound access to it and the discovered source hosts. Missing credentials, rejected keys, quota limits and network failures appear as discovery warnings. Manual source URLs still work when search is unavailable, provided the crawler has public DNS and access to those pages. You can explicitly choose Bing as an alternative; Google errors do not silently switch providers. Existing saved research without a provider field retains the previous Bing behavior.

## Research a question

1. Enter the question and an audience/report brief.
2. Optionally add up to 12 public source URLs. Leave web discovery enabled and choose **Google Programmable Search** (the default for new research) or **Bing RSS**. Google uses server-side API credentials; Bing RSS does not require a key. URL-based collection can run without search. Discovery availability varies by network and provider.
3. Set the source limit and optionally follow up to two same-host links from each initial page (one additional level only). **Research the web** collects HTML/plain-text pages, titles, readable text, retrieval times and errors. It does not execute page scripts or extract PDF documents. Search snippets help discovery; they are not supplied as source evidence.
4. Inspect the source text in **Sources**. Select the pages you want the AI to use. URLs, timestamps, excerpt length and truncation are visible. Collection does not establish a page's reliability, recency or factual correctness.
5. Click **Compile AI report**. The relay receives the question, brief, selected source excerpts, response schema and the separate [agent protocol](agent-spec.js). The response must reference the current request and cite collected source IDs. Unknown or missing citation IDs reject the report; a failed generation preserves the previous report.
6. Review the report against the collected text. Citation validation checks attribution membership, not whether a sentence or number is actually supported. Charts are rendered from validated numerical data and citations, not arbitrary model-supplied HTML. The prompt requires omitting quantitative charts when source evidence is insufficient. An automatic source-text-volume chart is always shown and explicitly describes collection volume rather than evidence quality.

Research log retains discovery results, warnings, page failures and the raw AI response. The AI request and report schema/protocol can be downloaded. The source excerpts sent to the AI are included in the downloaded request.

## Reports and files

Reports include an executive summary, themed sections, findings, optional comparison tables, optional bar/line charts, conclusions, limitations and a bibliography. Citations navigate to the report's source entries. The report keeps a snapshot of its source evidence, so a later crawl does not change an existing report's bibliography.

- **HTML report:** a self-contained document with inline SVG charts and styles. No scripts, remote chart libraries or external images are embedded.
- **Markdown:** narrative, source references, tables and textual chart data; it does not preserve the graphical layout.
- **Report JSON:** the structured report and its source evidence; it can be opened again in reportiX.
- **Save research:** a local JSON backup of the query, brief, discovery settings, collected sources, selection and report.
- **Print / PDF:** opens the browser print dialog with an A4 report stylesheet. Select the PDF destination in your browser to save a PDF.

The research workspace autosaves locally. Export important work because clearing browser storage removes it and large research sets can exceed browser storage capacity. Imported files are limited to 2 MB and validated before replacement. New research replaces the workspace after confirmation; there is no research-history Undo. Research is not uploaded automatically. Compiling a report sends the selected source text and question to the configured AI provider through the relay.

Changing the query, brief or source selection while an AI request is running prevents its response from replacing the report. Changing crawl settings during collection similarly prevents stale collection results from being applied. Stop aborts the browser request. The synchronous crawler may finish its already-started bounded server task even after the browser stops waiting.

## Crawling behavior and limits

The backend performs real HTTP requests with Python's standard library. It uses configured environment HTTP(S) proxies and normal TLS verification. It does not bypass CORS through a public third-party service, bypass paywalls or bot protections, run a browser, expose a general proxy, or read local/private network URLs.

Targets and redirect targets must be public HTTP(S) hosts on standard ports. Public DNS resolution is required to check that targets do not resolve to private, loopback or reserved addresses. Robots rules are checked for pages and redirect targets; an unavailable robots file generally prevents crawling (404/410 permit it). Pages can still reject the crawler. Cookies and logins are not used.

Limits: 1–12 sources; up to 24 page attempts; 18,000 characters supplied per source; 1 MB per fetched page; 8-second request timeouts; a roughly 65-second collection budget checked between page attempts; and up to three concurrent research tasks. The client stops waiting after 100 seconds for research or 90 seconds for the AI. Same-host page requests have a brief delay. The crawler is for bounded research, not exhaustive indexing. It may collect partial results with errors; inspect the log rather than treating missing pages as evidence of absence.

### Cloud environment note

In the current managed cloud environment, outbound traffic goes through a restricted proxy. Bing search is denied, and local public DNS lookup is unavailable. A direct request through the proxy to an allowed public source was reachable, but the crawler correctly rejects it when it cannot independently resolve and check its public address. Therefore live search/crawl is not established here. Do not disable public-address checks to work around that restriction. Run on a host with working public DNS and permitted outbound access, or configure those capabilities in the environment. Discovery hosts: `customsearch.googleapis.com` for Google and `www.bing.com` for Bing; source hosts and robots URLs also need outbound access.

AI availability additionally depends on a configured, reachable provider. Automated tests use controlled AI responses and do not incur provider calls.

## Verification

```sh
python3 reportiX/crawler_test.py
python3 reportiX/google_search_test.py
python3 reportiX/server_test.py
node reportiX/report-test.cjs
```

Start `server/server.py --port 8010`, then run `node reportiX/browser-test.cjs` and `node reportiX/google-browser-test.cjs` with Playwright and Chromium at `/usr/bin/chromium`, matching the other tools' development setup.

Tests cover public-target restrictions, extraction, search-feed parsing, Google API mapping, secret-safe settings, provider routing, robots decisions, API origin checks, source/citation validation, safe HTML and SVG rendering, report compilation, imports/exports, persistence, printing and responsive layout. Browser research/model responses use controlled fixtures. The real local relay health endpoint is checked; successful tests do not establish unrestricted internet crawling or a working paid AI provider.


## Tool-specific AI chat

Use AI chat to discuss findings and source evidence, revise the narrative, improve tables or propose supported visuals. It complements the existing compile-report action. Edits are restricted to a report using the existing source snapshot, require valid citations and are reviewed before application. Chat does not crawl additional pages.

See the [shared AI chat guide](../shared-ai/README.md) for relay setup, context selection, attachments, review, Undo, request/schema downloads and troubleshooting.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Paged AI input and output

Both conversational chat and the dedicated report compiler use the [shared paging transport](../shared-ai/PAGING.md). Complete source/request messages are paged without silent truncation, and output fragments are reassembled before report parsing, citation checks and existing document validation. The compiler's old 200,000-character raw-response guard is removed; its supported report structure/size and source limits still apply. Configure **AI paging** in the suite toolbar.

## Tool-specific productivity actions

Open **Workspace → Tool actions** for reviewed editing helpers, JSON/Markdown/CSV inventories and a tool-specific AI review draft. Changes use native validation and save recovery before application. See the [action catalog and interchange guide](../shared-suite/WORKSPACE.md#tool-actions-and-portable-inventories) for this app’s operations and limits.

Additional **Workspace → Tool actions** capability: Select the collected evidence cited by the current report without modifying source content. Review the native change preview before applying; a recovery point is saved automatically.

**Productivity extension:** Deduplicate source IDs in existing report citations without changing claims or collected evidence. Use **Workspace → Tool actions** to review and apply native changes.

**Reusable variants:** Build a follow-up research checklist from the question, selected sources and existing limitations. Available through **Workspace → Tool actions**, with native validation, preview and recovery.

## Project ZIP

Use **Project ZIP** in the header, or **Workspace → Recovery → Import / export project ZIP**, to save and restore the complete native project. Choose Computer or Virtual disk. Imports validate and stage a review; applying preserves the previous project in Recovery. Embedded assets are included, while separate app/relay settings and external workspace files are excluded. See the [shared ZIP guide](../shared-suite/PROJECT-ZIP.md).
