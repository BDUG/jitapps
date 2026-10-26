<p align="center">
  <img src="assets/agentic-desktop-suite.svg" alt="TLAL OS — Agentic Desktop Tool Suite" width="920">
</p>

# TLAL OS · Agentic Desktop Tool Suite

Sixteen local-first apps for architecture, graphics, images, video, documents, presentations, spreadsheets, mind maps, collaborative whiteboards, project planning, code, app generation, automation, and research. Use the searchable desktop launcher, share files through a virtual disk, and refine each app’s content with AI chat or the coding agent.

Load and save app contents through local disk or the shared virtual disk, including native project ZIP exports.

Run the suite in your browser with a single Python server, or build the optional **Tauri 2 desktop application**. Basic editing works without an AI account. AI features use providers configured on your local relay; generative image editing has its own image-provider configuration.

[Get started](#get-started) · [Apps](#the-16-apps) · [Screenshots](#screenshots) · [AI workflows](#ai-chat-and-image-tools) · [Coding agent](#workspace-coding-agent) · [Native desktop](#optional-tauri-2-desktop) · [Verification](#development-and-verification)

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

The relay page also has a **Server settings** dialog. Review changes and explicitly approve them to update live origins and command permissions; listener, workspace and service changes are saved for restart. Settings are stored privately in `server-settings.json` beside the startup provider config, or at `--server-config PATH`. Explicit startup flags override saved settings. See the [server settings reference](server/README.md#approved-runtime-server-settings).

## Complete server configuration example

This example enables the coding agent and explicitly allowlisted workflow commands, stores private data outside the repository, configures three text-provider profiles plus images/search. API/model names are examples: replace credentials and select a model available to your account. Optional integrations can be left unconfigured.

**1. Create private configuration and workspace directories** (POSIX shell, from the repository root):

```sh
umask 077
SUITE_CONFIG_DIR="$HOME/.config/tlal-os"
SUITE_WORKSPACE_DIR="$HOME/tlal-workspace"
mkdir -p "$SUITE_CONFIG_DIR" "$SUITE_WORKSPACE_DIR"
```

**2. Save `$SUITE_CONFIG_DIR/providers.json`:**

```json
{
  "format": "architex-relay-providers",
  "version": 1,
  "activeProfileId": "openai-main",
  "allowedOrigins": ["https://tools.example.com"],
  "profiles": [
    {
      "id": "openai-main",
      "provider": "openai",
      "name": "OpenAI chat",
      "protocol": "openai",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-4o-mini",
      "apiKey": "REPLACE_OPENAI_API_KEY",
      "upstreamProvider": "openai",
      "maxTokens": 8192,
      "tokenLimitEnabled": false,
      "temperature": 0.2
    },
    {
      "id": "gemini-main",
      "provider": "gemini",
      "name": "Gemini chat",
      "protocol": "gemini",
      "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      "model": "gemini-2.5-flash",
      "apiKey": "REPLACE_GEMINI_API_KEY",
      "upstreamProvider": "google",
      "maxTokens": 8192,
      "tokenLimitEnabled": true,
      "temperature": 0.2
    },
    {
      "id": "local-gateway",
      "provider": "litellm",
      "name": "Local LiteLLM gateway",
      "protocol": "openai",
      "endpoint": "http://localhost:4000/v1/chat/completions",
      "model": "gpt-4o-mini",
      "apiKey": "",
      "upstreamProvider": "openai",
      "maxTokens": 8192,
      "tokenLimitEnabled": false,
      "temperature": 0.2
    }
  ]
}
```

`tokenLimitEnabled: false` omits the request's output-token limit; it does not remove the provider's context/output limits. The local gateway must be running separately and its `model` must match a configured gateway alias. To use OpenRouter or Eden AI, add their presets in `/relay`. Remove the example origin if all apps are hosted on this server. JSON files use literal values; they do not expand `$VARIABLE` placeholders.

**3. Optional service files:**

`$SUITE_CONFIG_DIR/providers.images.json` — photiX generation/editing, separate from text chat:

```json
{
  "generationEndpoint": "https://api.openai.com/v1/images/generations",
  "editEndpoint": "https://api.openai.com/v1/images/edits",
  "model": "gpt-image-1",
  "apiKey": "REPLACE_IMAGE_API_KEY"
}
```

`$SUITE_CONFIG_DIR/search.json` — Google Programmable Search, not Google account sign-in:

```json
{
  "apiKey": "REPLACE_GOOGLE_SEARCH_API_KEY",
  "engineId": "REPLACE_PROGRAMMABLE_SEARCH_ENGINE_ID"
}
```

**4. Start the server with explicit paths and allowlists:**

```sh
python3 server/server.py \
  --bind 127.0.0.1 \
  --port 8000 \
  --config "$SUITE_CONFIG_DIR/providers.json" \
  --search-config "$SUITE_CONFIG_DIR/search.json" \
  --skills-db "$SUITE_CONFIG_DIR/skills/catalog.sqlite3" \
  --skills-offline \
  --allow-origin https://tools.example.com \
  --agent-workspace "$SUITE_WORKSPACE_DIR" \
  --agent-allow-command python3 \
  --agent-allow-command git \
  --workflow-cwd "$SUITE_WORKSPACE_DIR" \
  --allow-workflow-command python3
```

The named programs must be installed. The explicit agent allowlist replaces its auto-detected defaults; add `--agent-allow-command node` and `--agent-allow-command npm` if needed and installed. Workflow commands use a separate allowlist and are disabled unless explicitly enabled. These commands use your OS account's permissions, not a sandbox. On Windows, use your installed Python command and absolute configuration/workspace paths in PowerShell or Command Prompt; the POSIX shell syntax above is not a PowerShell script.

`--skills-offline` prevents remote **skill catalog refresh only**; omit it for online source refresh and ensure `SUITE_SKILLS_OFFLINE` is not `1`. CLI origins and JSON `allowedOrigins` combine. The example's remote origin can use chat/image relay calls if it can reach this server, but cannot administer providers or use local-only agent/workflow/research/catalog endpoints. Loopback binding makes the server reachable only on this machine.

For prepared optional agent analysis, append these flags to the command above **only after installing their prerequisites**:

```sh
--agent-navigation-dir /absolute/path/to/code-navigation
--agent-embedding-dir /absolute/path/to/prepared-minilm-model
```

The navigation directory needs `service.cjs` and installed TypeScript (`npm ci --prefix server/code-navigation` prepares the bundled service). The embedding directory needs `model.onnx`, `tokenizer.json`, `manifest.json` and `server/requirements-agent.txt`. See [analysis setup](shared-agent/TECHNIQUES.md). These paths are not downloaded or prepared automatically.

For a restricted variant, append `--agent-no-commands` to disable agent terminal execution, or `--disable-agent` to disable the whole coding runtime. Workflow execution is independent: omit `--allow-workflow-command` to disable it. Inspect all defaults, flag precedence, environment variables, file fields and the native wrapper's separate `--suite-root` option in the [complete server parameter reference](server/README.md#complete-startup-parameter-reference).

**5. Verify and use:** open [the desktop](http://127.0.0.1:8000/), configure/test the active provider at [AI relay settings](http://127.0.0.1:8000/relay), and use **Check runtime** in the coding-agent tab. `/api/health` checks relay availability; `/api/agent/health` additionally requires a same-local-origin request with `X-Architex-Request: 1`. Provider tests and AI calls may incur charges. Run startup without making a provider call to verify local configuration first. Restart after hand-editing startup-loaded provider files or changing flags; `/relay` applies its own saved profile changes live.

## The 16 apps

| App | Open | Main capabilities |
| --- | --- | --- |
| **[architeX](architex/README.md)** | [/architex/](architex/) | Metamodels and instance graphs, optional direct diagrams, nested components, directional ports, scripted validation, dependency layout and AI model editing. Exchange JSON, YAML, Markdown, draw.io, SVG, Mermaid, PlantUML, XLSX and Sphinx-Needs/RST projects. |
| **[colabriX](colabriX/README.md)** | [/colabriX/](colabriX/) | Collaborative whiteboards with notes, shapes, connectors, frames, freehand, comments, voting, workshop timers and AI proposals. Export JSON, SVG, PNG, Markdown, CSV and project ZIP. |
| **[designiX](designiX/README.md)** | [/designiX/](designiX/) | Multi-page graphic design with editable templates, shapes, typography, brand kits, embedded images, grouping, layers and AI proposals. Export SVG, PNG/JPEG/WebP, multi-page PDF and native project ZIPs. |
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
| **architeX** | “Create Sensor, Gateway and Dashboard definitions and instances. Add compatible directional policies and temperature data-point ports, then connect Sensor → Gateway → Dashboard.” | Review both models, run validation, export JSON/YAML or draw.io. |
| **graphiX** | “Draw a yellow smiley with dark eyes and a curved smile. Return editable SVG artwork.” | Apply the drawing, then ask “Make the smile wider and add rosy cheeks.” Export SVG. |
| **colabriX** | “Cluster these notes into themes and add a next-steps frame with connected action items.” | Review the AI board proposal and apply it; share the board through a Google document for multi-party editing. |
| **designiX** | “Create two coordinated launch posters for a coffee brand using our brand kit.” | Ask AI chat, review the editable page proposal and apply it; export artwork or a complete project. |
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

- **Commands and navigation:** search by multiple words, pin frequent actions, filter recently opened commands, and navigate results with the keyboard. Search the app-specific editing catalog and open an action’s controls without applying it. Shortcuts also open project ZIPs, disk backups and the coding-agent window. Preferences persist per editor.
- **Find/replace and Bulk edit:** filter supported fields, prepare typed batch changes or import edit sets, and review a native-document diff before applying.
- **Project ZIP:** export/import the complete native project from every app, using local or virtual disk. Review before applying; embedded media stays with the project. See the [ZIP guide](shared-suite/PROJECT-ZIP.md).
- **Recovery:** named versions, rolling automatic checkpoints, comparisons and portable backups. Applying reviewed workspace changes first saves a recovery point.
- **Tool actions:** app-specific layout, formatting, cleanup, productivity and structural-copy operations. Export inventories, schemas and inspection reports.
- **Saved presets and workflows:** retain action settings, order selected steps and save an independent named workflow. Each step validates against the previous result; failure leaves the live document unchanged. Import/export libraries and apply one combined reviewed result.
- **AI handoffs:** download native content, schemas, context and a spec-driven editing template, or draft app-specific follow-up prompts without sending automatically.

**Virtual disk** is a shared browser IndexedDB file store. Load from computer or virtual disk through supported import controls. Choose **Destination: Computer / Virtual disk** in the relevant export controls, then save normally. The disk supports folders, uploads, folder uploads, ZIP downloads and app-specific import readers; complete folder trees are supported where the reader requires them.

**Whole-disk backups:** open **Virtual disk → Disk ZIP backup · all folders** to export everything to ZIP or preview an imported archive. Restore can keep existing files, overwrite matching paths, or replace the entire disk with confirmation. Folders, binary files and backup metadata are preserved; restore is atomic and rejects stale previews. Ordinary folder ZIPs are also supported. See the [disk backup guide](shared-suite/README.md#whole-virtual-disk-zip-backup-and-restore) for limits and policies.

The disk is shared only at the **same origin and browser profile**. Changing hostname, port, profile or moving to Tauri creates separate browser storage. It is not your operating-system workspace or a cloud sync service. Files are limited to **50 MiB each**, with additional per-app format limits and browser quota. Download important backups before clearing site data.

See [workspace tools](shared-suite/WORKSPACE.md) and [virtual disk](shared-suite/README.md).

Chat and coding-agent requests also support [multimodal image/audio/PDF references and returned media](shared-ai/MULTIMODAL.md), with previews, downloads and explicit reuse. Provider/model support is required; media does not apply changes or execute tools.

## Workspace coding agent

Advanced capabilities include [compiler/AST navigation, optional learned embeddings, independent review, task dependencies and real-model evaluations](shared-agent/TECHNIQUES.md). The guide also records the remaining technique gaps and setup requirements.

Read the [step-by-step input → execution → workspace update guide](shared-agent/HOW-IT-WORKS.md) for the complete lifecycle, a flow diagram, review behavior and a worked example.

Use the **Coding agent** tab for an iterative sense/plan/act loop over the open app project and a local server workspace. It can inspect files, edit code, maintain working scripts, call allowed local programs, observe results and iterate.

- Live, foldable operation trace; task checklist; recorded command output and verification evidence.
- Follow-up instructions, pause/stop/resume, pending questions and recorded-call recovery without blindly replaying side effects.
- Aggressive context compression, paged source/result retrieval and local SQLite vector working memory.
- Learned, versioned local skills and reusable tools/workflows shared across sessions in the same workspace.
- Acceptance checks and completion review against observed tool results.
- Before starting, choose whether takeovers into the open app must be reviewed. Native validation and stale-document guards still apply.
- Inspect changes, apply to the current project, undo project edits, export patches, or download a result ZIP with changed files, scripts, retained logs and evidence.

By default, the browser/server deployment uses the repository as its coding workspace; use `--agent-workspace` for another directory. Installed Python/Node/npm/git commands are enabled by default for agent runs through the allowlist. Use `--agent-no-commands` or `--disable-agent` to disable execution or the runtime. Allowed commands run with the server user’s OS permissions; they are not sandboxed. Workflow command steps have a separate allowlist and remain disabled by default.

The virtual disk, browser project and server filesystem are distinct. Importing a chat or handoff does not grant filesystem permissions or execute historical instructions. See the [coding-agent guide](shared-agent/README.md) for policies, working memory, local skill learning, reusable tools, paging and recovery.

## Add your own desktop apps

In **codeiX** or **appiX**, choose **Add to desktop** to install a saved project snapshot. Choose a name, description and logo; codeiX projects also need an HTML entry point. Desktop tiles open an isolated app runner with **Run app**, **Stop**, **Edit source project** and **App settings**. Use **App settings** to change an added app's name, description or logo, or remove it. Standard suite apps cannot be removed or modified through this manager.

To publish changes, reopen the source editor, edit the project, choose **Add to desktop**, and select **Update …** instead of creating another app. Removing an app deletes its installed snapshot, while the editor's source project stays unchanged. Logos can be loaded from local disk or virtual disk; SVG logos are sanitized and rasterized.

Installed apps are kept in this browser's IndexedDB for this origin, separately from the shared virtual disk. Export source projects for backup before clearing browser storage. Static codeiX HTML, local classic JavaScript, stylesheets and SVG images are bundled; module-based projects, backend programs and build-dependent projects must first be bundled into a static browser app. Relative fetches and imports need to be bundled or inlined as well. Added apps run without desktop/workspace access or same-origin storage. HTTPS fetch and external assets can be enabled per app; browsers still enforce CORS. Runtime state stays inside the isolated frame and resets on restart.


## Headless coding-agent library

[`codingagentlib/`](codingagentlib/README.md) contains the extracted JavaScript planning core and Python workspace runtime. Reuse it without the desktop or HTTP server through a standalone Python package/CLI, a Node.js local adapter, or a Rust crate. The Rust crate has its own native runtime and tools, with no Python or worker dependency. Model calls are injected by the application; examples and tests run with deterministic callbacks and no paid provider. Existing browser/server integration and compatibility imports remain available.

```sh
python3 -m pip install ./codingagentlib
python3 -m codingagentlib --workspace /absolute/path/to/workspace
# Native Rust integration, no Python package required:
cargo test --manifest-path codingagentlib/rust/Cargo.toml
```

See [language examples, capabilities and protocol](codingagentlib/README.md) for permissions, step budgets, cancellation, packaging and the differences between the JavaScript and Python/Rust drivers.

## Shared skill catalog

The server starts a local SQLite vector index and a background source-refresh worker for AI chat and coding-agent retrieval. A bundled, attributed snapshot provides cached skill documents and directory references without an embedding service or GPU.

Open **Skill set** from the desktop/chat, or **Agent tools → Skills**. Edit the proposed defaults per app, read skills in pages, filter/search sources, refresh a source, copy another app’s settings, preview retrieval, import/export sets and inspect saved revisions. Selected skills have an **Edit instructions** control for their name, description and Markdown; **Create custom skill** adds your own procedure. App-specific edits are included in copied/exported sets and saved revisions without changing indexed sources. Filter selected skills, toggle individual skills without removing them, reorder equal-score priorities, duplicate procedures and review or discard the draft before saving.

Sources include obra/superpowers, VoltAgent/awesome-agent-skills, mattpocock/skills, addyosmani/agent-skills and Linkly’s skills index. Source availability and fetch failures are visible; cached content survives failed refreshes. Indexing Markdown does not install or run its scripts. Shared catalog skills are separate from the coding agent’s learned local skills. Use `--skills-offline` to stay with bundled/cached content. See [skill management and provenance](docs/SHARED-SKILLS.md).

## Optional Tauri 2 desktop

The [`desktop-tauri/`](desktop-tauri/README.md) wrapper packages the desktop, all 16 apps, and a frozen Python server sidecar. End users do not need Python or Node just to launch a packaged build; coding-agent commands still require the tools they execute.

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

[![TLAL OS desktop with 16 apps](assets/screenshots/desktop.png)](assets/screenshots/desktop.png)

| | |
| --- | --- |
| **[architeX](architex/README.md)**<br>[![architeX workspace](assets/screenshots/architex.png)](assets/screenshots/architex.png) | **[graphiX](graphiX/README.md)**<br>[![graphiX workspace](assets/screenshots/graphiX.png)](assets/screenshots/graphiX.png) |
| **[colabriX](colabriX/README.md)**<br>[![colabriX whiteboard](assets/screenshots/colabriX.png)](assets/screenshots/colabriX.png) | **[designiX](designiX/README.md)**<br>[![designiX workspace](assets/screenshots/designiX.png)](assets/screenshots/designiX.png) |
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

Saved editing workflows in every editor support renaming, independent duplication, and reordering or removing individual steps under **Workspace → Tools**. Preview the combined changes before applying them with recovery.

Chat and coding-agent inputs can optionally be rewritten into **ASD-STE100-style Simplified Technical English** before submission. Each app has independent chat/agent toggles, off by default. Originals and technical literals are retained. See the [input-conversion guide](shared-ai/INPUT-STE.md).
