<p align="center">
  <img src="assets/agentic-desktop-suite.svg" alt="TLAL OS — Agentic Desktop Tool Suite" width="920">
</p>

# TLAL OS · Agentic Desktop Tool Suite

Fourteen local-first apps for architecture, graphics, images, video, documents, presentations, spreadsheets, mind maps, project planning, code, app generation, automation, and research. Use the searchable desktop launcher, share files through a virtual disk, and refine each app’s content with AI chat or the coding agent.

Run the suite in your browser with a single Python server, or build the optional **Tauri 2 desktop application**. Basic editing works without an AI account. AI features use providers configured on your local relay; generative image editing has its own image-provider configuration.

[Get started](#get-started) · [Apps](#the-14-apps) · [Screenshots](#screenshots) · [AI workflows](#ai-chat-and-image-tools) · [Coding agent](#workspace-coding-agent) · [Native desktop](#optional-tauri-2-desktop) · [Verification](#development-and-verification)

## Project disclosure and license

This is a personal hobby project for learning, experimentation, and enjoyment. It is not developed for commercial purposes or offered as a commercial product.

The [MIT License](LICENSE) permits commercial use. The disclosure describes the project’s development purpose and adds no restrictions to that license. Bundled dependencies and skill documents retain their respective licenses. The suite is an independent implementation; feature coverage and file fidelity vary by app and format.

## Get started

Use Python **3.10 or newer**. Browser deployment needs no frontend build or Python package installation.

```sh
git clone https://github.com/BDUG/singlepageapps.git
cd singlepageapps
python3 server/server.py
```

Open **http://127.0.0.1:8000/** for the desktop. Open **http://127.0.0.1:8000/relay** to configure AI providers. On systems where Python is named `python`, use that command instead.

One server supplies every app, the AI relay, image editing API, research/crawling, shared skill catalog, and coding-agent runtime. Keep the repository folders together: apps reuse shared modules and vendored libraries.

Useful startup options:

```sh
# Different port; use only bundled/cached skills without background source refresh.
python3 server/server.py --port 8010 --skills-offline

# Select private configuration and a dedicated coding workspace.
python3 server/server.py \
  --config /path/to/private/providers.json \
  --search-config /path/to/private/search.json \
  --agent-workspace /path/to/workspace

# Keep chat/editors available while disabling the local coding runtime.
python3 server/server.py --disable-agent
```

The default bind address is loopback (`127.0.0.1`). `python3 -m server` is equivalent. A plain static server can host the editors but does not supply relay, research, skill-index or coding-runtime endpoints. Serve the apps over HTTP rather than opening files directly. See the [server guide](server/README.md) for configuration, command allowlists, exact allowed origins and compatibility launchers.

## The 14 apps

| App | Open | Main capabilities |
| --- | --- | --- |
| **[Architex](architex/README.md)** | [/architex/](architex/) | Metamodels and instance graphs, optional direct diagrams, nested components, directional ports, scripted validation, dependency layout and AI model editing. Exchange JSON, YAML, Markdown, draw.io, SVG, Mermaid, PlantUML, XLSX and Sphinx-Needs/RST projects. |
| **[graphiX](graphiX/README.md)** | [/graphiX/](graphiX/) | Editable SVG shapes, paths, text, groups, layers and properties; mouse editing, zoom, SVG/PNG export and AI artwork proposals. |
| **[photiX](photiX/README.md)** | [/photiX/](photiX/) | Raster-image effects and captions scoped to rectangular selections or the whole image. Generative fill/removal, expansion, generation, reference-guided edits and variations through an image provider. PNG/JPEG/WebP and editable JSON projects. |
| **[sketchiX](sketchiX/README.md)** | [/sketchiX/](sketchiX/) | Connected diagrams and UML shapes, plus separate sketch and reusable-shape editors with their own AI chats. Exchange draw.io, SVG, PlantUML, PPTX and Visio VSDX. |
| **[mindiX](mindiX/README.md)** | [/mindiX/](mindiX/) | Hierarchical topics, images, notes, task metadata, branch arrangement/collapse and styled connections. Export JSON, draw.io, SVG and PPTX. |
| **[projectiX](projectiX/README.md)** | [/projectiX/](projectiX/) | Tasks, milestones, dependencies, resources and Gantt scheduling. Microsoft Project XML interchange and XLSX/SVG/draw.io exports. |
| **[textiX](textiX/README.md)** | [/textiX/](textiX/) | Rich text, headings, tables, images, find/replace, page breaks, DOCX and PDF import/export, HTML, Markdown and plain text. |
| **[presentiX](presentiX/README.md)** | [/presentiX/](presentiX/) | Slides with editable text, shapes, images and speaker notes; presentation mode, PPTX interchange and AI deck editing. |
| **[sheetiX](sheetiX/README.md)** | [/sheetiX/](sheetiX/) | Formulas, multiple sheets, formatting, sorting, formula-aware fill and transpose; XLSX/CSV/JSON interchange. |
| **[vidiX](vidiX/README.md)** | [/vidiX/](vidiX/) | Layered timelines, clips, drawing frames, editable design scenes, motion presets and brand colors. Animated GIF/SVG and browser-supported silent video export. |
| **[appiX](appiX/README.md)** | [/appiX/](appiX/) | Generate SPAs, design screens and logic without code, edit HTML/CSS/JS, preview safely, and export standalone apps, a UI SDK, deployment packages or a Rust Cargo project. |
| **[codeiX](codeiX/README.md)** | [/codeiX/](codeiX/) | Project files, code search/editing, local-workspace integration, AI changes, coding-agent execution and source ZIP or Tauri 2 project ZIP export. |
| **[automatextiX](automatextiX/README.md)** | [/automatextiX/](automatextiX/) | Connect transforms, AI calls, virtual-disk files, web requests, branching and allowed local commands. Pass step results onward and inspect execution logs. |
| **[reportiX](reportiX/README.md)** | [/reportiX/](reportiX/) | Google/Bing source discovery, public-page crawling, source libraries, cited reports, comparison tables and SVG charts, with AI questions and revisions. |

Format support emphasizes each app’s editable model, not lossless reproduction of every feature from another product. For example, projectiX exchanges **Microsoft Project XML**, not native `.mpp`; textiX extracts PDF text into paragraphs or inserts image-only pages as images, and its direct PDF export renders page images. App guides document the details.

## AI chat and image tools

1. Start the suite server and open **Desktop → AI relay → Open provider settings**, or visit `/relay` directly.
2. Configure and test a text provider: OpenAI, Gemini, Eden AI, LiteLLM, OpenRouter or a compatible gateway. Save the full endpoint, model and credentials on the relay.
3. Open **AI chat** in an app, or codeiX’s integrated chat. The app knows the relay URL; provider credentials stay on the server.
4. Include the current document, selection and any named attachments. Ask questions, choose offered options, or request changes.
5. Review an editing proposal, apply it, then continue the conversation to refine the result. **New conversation** starts without prior chat history.

Chats include app-specific context, schemas and editing instructions. Conversation save/load, transcript export, search and resizable panels support longer work. Paging can transfer large inputs and outputs, retry interrupted pages and retain partial results; it does not override provider context/token limits or native document validation. Invalid structured responses receive bounded correction attempts.

### Generative image editing in photiX

In `/relay`, configure **photiX image provider** separately from text chat. The image adapter uses **OpenAI Images-compatible generation/edit endpoints**, an image model such as `gpt-image-1`, and PNG base64 results. A working text-chat profile does not automatically provide image generation.

In photiX, drag a selection or choose **Whole image**, then use **Generative image chat**. Choose fill, object removal, canvas expansion, image generation, harmonization or background removal; optionally load a reference image for edits. Generate one to three options and explicitly apply a preview. Selected edits preserve outside pixels; expansion copies the original center back over the generated result.

Standard text chat handles deterministic effects such as blur, pixelation, brightness and captions. Crop, rotate, flip and 2×/4× upscaling are local transforms; upscaling uses resampling, not AI detail reconstruction. Generative quality, masks, references and transparent backgrounds depend on the configured image model. Requests may incur provider charges. See the [photiX guide](photiX/README.md).

See [shared AI chat](shared-ai/README.md), [paging](shared-ai/PAGING.md) and [relay setup](server/README.md) for protocols and troubleshooting.

## Agentic examples

These are prompts to try, not recorded live-provider results. Normal chat edits require a proposal to be applied; a text answer alone does not update the editor. Treat generated code, calculations and factual claims as material to inspect and verify.

| App | Try this | Expected workflow |
| --- | --- | --- |
| **Architex** | “Create Sensor, Gateway and Dashboard definitions and instances. Add compatible directional policies and temperature data-point ports, then connect Sensor → Gateway → Dashboard.” | Review both models, run validation, export JSON/YAML or draw.io. |
| **graphiX** | “Draw a yellow smiley with dark eyes and a curved smile. Return editable SVG artwork.” | Apply the drawing, then ask “Make the smile wider and add rosy cheeks.” Export SVG. |
| **photiX** | “Pixelate the selected area using 12-pixel blocks.” | Select a rectangle, ask standard AI chat, review and apply. For “Replace this area with a flower garden,” use Generative image chat with an image provider. |
| **sketchiX** | “Draw a UML-style order flow between Customer, Web shop, Payment service and Warehouse, with labeled arrows.” | Review editable nodes/connections; export draw.io, SVG or PPTX. |
| **mindiX** | “Map a community garden with Site, People, Budget, Planting and Maintenance branches. Add three practical subtopics per branch and next-action notes.” | Review and arrange the hierarchy; export JSON, SVG or PPTX. |
| **projectiX** | “Plan a six-week garden launch with approvals, volunteers, supplies, preparation, planting and an opening milestone. Add sensible dependencies and owners; label dates as assumptions.” | Review the schedule/Gantt; export Project XML or XLSX. |
| **textiX** | “Draft a volunteer welcome guide with a heading, introduction, safety checklist and a two-column responsibilities table. Label sample details as placeholders.” | Apply formatted content; save DOCX, PDF, HTML or Markdown. |
| **presentiX** | “Create five slides pitching a community garden: vision, benefits, site, launch plan and volunteer call to action. Include speaker notes.” | Review editable slides and export PPTX. |
| **sheetiX** | “Build a budget: seeds 10 × 3, soil 8 × 12, tools 5 × 25 and signs 2 × 18. Use formulas for totals and currency formatting.” | Check formulas and the expected grand total **287**; export XLSX/CSV. |
| **vidiX** | “Create a six-second looping title card with a moving yellow circle and a white title fading in and out. Use editable text and shape layers.” | Review the timeline; export animated GIF/SVG or supported silent video. |
| **appiX** | “Build a self-contained Tetris game with movement, rotation, line clearing, score, pause, restart and keyboard instructions. Return complete HTML/CSS/JS.” | Review, explicitly run the sandboxed preview, test interactions and export the app. |
| **codeiX** | “Add watering.html: inputs for bed area and water depth, validation, and liters = square meters × millimeters. Preserve existing files and propose verification steps.” | Review file changes or use a coding-agent run to implement and test; export source/Tauri ZIP or write to a linked workspace. |
| **automatextiX** | “Read garden-notes.txt from virtual disk, pass its text to an AI checklist step, then write garden-actions.txt. Chain results and avoid overwriting an existing file.” | Add the input file, review mappings, then run the workflow with a configured provider. |
| **reportiX** | “Using only collected sources, compare garden watering options. Cite source IDs, add a table and explain evidence gaps. Chart only supported numeric data.” | Collect sources first, then review a cited report proposal and export HTML or print to PDF. |

## Shared workspace and virtual disk

Open **Workspace** or press **Ctrl/Cmd+K** in an editor. The same tools also support sketchiX’s separate sketch and shape editors—**16 editor pages** in total.

- **Commands and navigation:** search actions and move between apps.
- **Find/replace and Bulk edit:** filter supported fields, prepare typed batch changes or import edit sets, and review a native-document diff before applying.
- **Recovery:** named versions, rolling automatic checkpoints, comparisons and portable backups. Applying reviewed workspace changes first saves a recovery point.
- **Tool actions:** app-specific layout, formatting, cleanup, productivity and structural-copy operations. Export inventories, schemas and inspection reports.
- **Saved presets and workflows:** retain action settings, order selected steps and save an independent named workflow. Each step validates against the previous result; failure leaves the live document unchanged. Import/export libraries and apply one combined reviewed result.
- **AI handoffs:** download native content, schemas, context and a spec-driven editing template, or draft app-specific follow-up prompts without sending automatically.

**Virtual disk** is a shared browser IndexedDB file store. Load from computer or virtual disk through supported import controls. Choose **Destination: Computer / Virtual disk** in the relevant export controls, then save normally. The disk supports folders, uploads, folder uploads, ZIP downloads and app-specific import readers; complete folder trees are supported where the reader requires them.

The disk is shared only at the **same origin and browser profile**. Changing hostname, port, profile or moving to Tauri creates separate browser storage. It is not your operating-system workspace or a cloud sync service. Files are limited to **50 MiB each**, with additional per-app format limits and browser quota. Download important backups before clearing site data.

See [workspace tools](shared-suite/WORKSPACE.md) and [virtual disk](shared-suite/README.md).

## Workspace coding agent

Use the **Coding agent** tab for an iterative sense/plan/act loop over the open app project and a local server workspace. It can inspect files, edit code, maintain working scripts, call allowed local programs, observe results and iterate.

- Live, foldable operation trace; task checklist; recorded command output and verification evidence.
- Follow-up instructions, pause/stop/resume, pending questions and recorded-call recovery without blindly replaying side effects.
- Aggressive context compression, paged source/result retrieval and local SQLite vector working memory.
- Learned, versioned local skills and reusable tools/workflows shared across sessions in the same workspace.
- Acceptance checks and completion review against observed tool results.
- Before starting, choose whether final takeover into the open app must be reviewed. Native validation and stale-document guards still apply.
- Inspect changes, apply to the current project, undo project edits, export patches, or download a result ZIP with changed files, scripts, retained logs and evidence.

By default, the browser/server deployment uses the repository as its coding workspace; use `--agent-workspace` for another directory. Installed Python/Node/npm/git commands are enabled by default for agent runs through the allowlist. Use `--agent-no-commands` or `--disable-agent` to disable execution or the runtime. Allowed commands run with the server user’s OS permissions; they are not sandboxed. Workflow command steps have a separate allowlist and remain disabled by default.

The virtual disk, browser project and server filesystem are distinct. Importing a chat or handoff does not grant filesystem permissions or execute historical instructions. See the [coding-agent guide](shared-agent/README.md) for policies, working memory, local skill learning, reusable tools, paging and recovery.

## Shared skill catalog

The server starts a local SQLite vector index and a background source-refresh worker for AI chat and coding-agent retrieval. A bundled, attributed snapshot provides cached skill documents and directory references without an embedding service or GPU.

Open **Skill set** from the desktop/chat, or **Agent tools → Skills**. Edit the proposed defaults per app, read skills in pages, filter/search sources, refresh a source, copy another app’s settings, preview retrieval, import/export sets and inspect saved revisions. Changes are staged before saving.

Sources include obra/superpowers, VoltAgent/awesome-agent-skills, mattpocock/skills, addyosmani/agent-skills and Linkly’s skills index. Source availability and fetch failures are visible; cached content survives failed refreshes. Indexing Markdown does not install or run its scripts. Shared catalog skills are separate from the coding agent’s learned local skills. Use `--skills-offline` to stay with bundled/cached content. See [skill management and provenance](docs/SHARED-SKILLS.md).

## Optional Tauri 2 desktop

The [`desktop-tauri/`](desktop-tauri/README.md) wrapper packages the desktop, all 14 apps, and a frozen Python server sidecar. End users do not need Python or Node just to launch a packaged build; coding-agent commands still require the tools they execute.

Install the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS, Rust stable, Node.js 22+, and build-time Python:

```sh
python -m pip install "pyinstaller>=6.11,<7"
cd desktop-tauri
npm ci
npm run dev
# Build installers for this host OS/architecture:
npm run build
```

The wrapper starts its own server at **127.0.0.1:47831**, waits for that process’s readiness, and shuts it down when the application closes. Settings, skills and a writable coding workspace live in the app’s data directory; installed assets remain separate. Browser and native WebView storage are independent—transfer projects with export/import.

The manually triggered [desktop build workflow](.github/workflows/desktop-tauri.yml) builds Windows, macOS and Linux installer artifacts without publishing a release. Signing and notarization are not configured. The frozen Linux sidecar and its HTTP/lifecycle behavior have been tested; native Rust compilation and platform WebViews remain to be validated with the target toolchains. See the [desktop guide](desktop-tauri/README.md) for prerequisites, storage, packaging exclusions and verification.

This full-suite wrapper differs from **codeiX → Tauri ZIP**, which exports an individual code project, and **appiX → Rust project**, which exports a Rust server for a generated browser app.

## Storage, configuration and network access

| Data | Browser/server deployment | Optional native desktop |
| --- | --- | --- |
| Editor autosave, chat UI settings, presets and virtual disk | Browser localStorage/IndexedDB for the current origin/profile | Native WebView storage; separate from your regular browser |
| Text-provider settings and keys | `$XDG_CONFIG_HOME/architex-relay/providers.json` (fallback `~/.config/…`), or `--config` | App-local `config/providers.json` |
| photiX image-provider settings/key | Beside the selected provider config: `<config-stem>.images.json` | App-local `config/providers.images.json` |
| Search settings | `$XDG_CONFIG_HOME/reportix/search.json`, or `--search-config` | App-local `config/search.json` |
| Shared skill index and app skill sets | `skills/catalog.sqlite3` beside provider config, or `--skills-db` | App-local `skills/catalog.sqlite3` |
| Agent files, sessions, scripts, memory and learned skills | Selected `--agent-workspace` and its private runtime data | App-local `workspace/` |

Keys are stored by the relay rather than individual apps. Default provider exports omit keys. Autosave is local persistence, not synchronization or a substitute for external backups.

AI requests send the selected app context, attachments and retrieved skill references to the configured provider. Generative image requests send source images, masks and optional reference images. Research fetches requested public pages; HTTP and AI workflow steps run when the workflow executes. Remote skill refresh contacts the configured sources.

Provider APIs, source availability, DNS, TLS trust, quotas, image-model capabilities and browser media codecs affect results. If chat reports a fetch failure, check the relay URL, relay health and provider diagnostics; restart the updated server when adding new endpoints. For separately hosted apps, allow their exact origin in relay settings. Provider administration and local execution use the relay’s local-origin policy. See [server setup](server/README.md) and [research configuration](reportiX/README.md).

## Screenshots

Fresh browser sessions show the desktop and every app. photiX uses a locally drawn illustrative sample; screenshots do not call AI providers. Click an image for full size.

[![TLAL OS desktop with 14 apps](assets/screenshots/desktop.png)](assets/screenshots/desktop.png)

| | |
| --- | --- |
| **[Architex](architex/README.md)**<br>[![Architex workspace](assets/screenshots/architex.png)](assets/screenshots/architex.png) | **[graphiX](graphiX/README.md)**<br>[![graphiX workspace](assets/screenshots/graphiX.png)](assets/screenshots/graphiX.png) |
| **[photiX](photiX/README.md)**<br>[![photiX workspace](assets/screenshots/photiX.png)](assets/screenshots/photiX.png) | **[sketchiX](sketchiX/README.md)**<br>[![sketchiX workspace](assets/screenshots/sketchiX.png)](assets/screenshots/sketchiX.png) |
| **[mindiX](mindiX/README.md)**<br>[![mindiX workspace](assets/screenshots/mindiX.png)](assets/screenshots/mindiX.png) | **[projectiX](projectiX/README.md)**<br>[![projectiX workspace](assets/screenshots/projectiX.png)](assets/screenshots/projectiX.png) |
| **[textiX](textiX/README.md)**<br>[![textiX workspace](assets/screenshots/textiX.png)](assets/screenshots/textiX.png) | **[presentiX](presentiX/README.md)**<br>[![presentiX workspace](assets/screenshots/presentiX.png)](assets/screenshots/presentiX.png) |
| **[sheetiX](sheetiX/README.md)**<br>[![sheetiX workspace](assets/screenshots/sheetiX.png)](assets/screenshots/sheetiX.png) | **[vidiX](vidiX/README.md)**<br>[![vidiX workspace](assets/screenshots/vidiX.png)](assets/screenshots/vidiX.png) |
| **[appiX](appiX/README.md)**<br>[![appiX workspace](assets/screenshots/appiX.png)](assets/screenshots/appiX.png) | **[codeiX](codeiX/README.md)**<br>[![codeiX workspace](assets/screenshots/codeiX.png)](assets/screenshots/codeiX.png) |
| **[automatextiX](automatextiX/README.md)**<br>[![automatextiX workspace](assets/screenshots/automatextiX.png)](assets/screenshots/automatextiX.png) | **[reportiX](reportiX/README.md)**<br>[![reportiX workspace](assets/screenshots/reportiX.png)](assets/screenshots/reportiX.png) |

Refresh the gallery with a running suite server, Playwright and Chromium:

```sh
BASE_URL=http://127.0.0.1:8000 node scripts/capture-screenshots.cjs
# Optional: ONLY=desktop,photiX and CHROMIUM_PATH=/path/to/chromium
```

## Development and verification

Node.js is used for developer checks, not normal browser startup. Browser checks require Playwright and Chromium; some interchange tests additionally use Python libraries documented by the app guides.

```sh
# JavaScript unit checks.
node scripts/verify-suite.cjs

# With the suite server running: unit + browser checks and a saved report.
node scripts/verify-suite.cjs --browser \
  --base-url http://127.0.0.1:8000 --report /tmp/suite-report.json

# Backend checks.
python3 -m unittest discover -s server -p '*_test.py'

# Optional desktop staging and server lifecycle checks.
npm run check --prefix desktop-tauri
```

Add `--rust` to the suite gate to verify an exported Rust project when Cargo is available. Desktop native builds need the separate Tauri toolchain. Some coding-agent tests execute commands in temporary workspaces. Automated AI tests use fixtures; passing them does not establish live-provider quality, lossless format fidelity, production performance or parity with commercial applications.

Further reading: [product roadmap](docs/PRODUCT-ROADMAP.md), [verification baseline](docs/verification-baseline.json), [button checks](docs/BUTTON-VERIFICATION.md), [TLAL OS interface guide](docs/UI-STYLE.md), and each app’s README linked above.
