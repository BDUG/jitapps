# appiX

A local-first single-page app generator in the visual style of Architex. Start from a working template or describe an app to its AI assistant, edit its HTML/CSS/JavaScript, run an isolated browser preview, and export a complete single-file application.

Open `appiX/index.html` directly, or start the shared server with `python3 server/server.py` (port 8000), then open `/appiX/`. No frontend build or package installation is needed. ZIP export and chat reuse `architex/vendor/jszip.min.js` and `shared-ai/`; keep the repository folders together.

## From brief to app

1. Name the app and describe its audience, requirements and interactions in **App brief**.
2. Choose Task list, Cost calculator, Landing page or Blank canvas and an accent color. **Create starter** replaces the current code after confirmation and records an Undo checkpoint. Starters are deterministic local generators; they do not reinterpret arbitrary briefs as implemented requirements. The landing starter includes your description as text.
3. Use **Build with AI** to open the tool-specific assistant with a build request, or use **AI chat** for questions and focused changes. The AI receives the app brief, complete source, selected source text and preview diagnostics when context is enabled. Configure the shared relay and its provider as described in the [AI chat guide](../shared-ai/README.md).
4. Review proposed project replacements before applying them. All HTML/CSS/JavaScript and the brief are shown in the proposal. Edits must match the current project snapshot; manual changes invalidate stale proposals. Native Undo and **Undo AI edit** can restore an applied replacement.
5. Click **Run preview** explicitly to run the current app. Applying/importing a project or restoring history stops the existing preview. AI code is not run automatically. Source edits leave the prior preview visible until you run again; the status shows that the code changed.

The generator targets self-contained apps without frameworks, remote assets, backend APIs or build tools. The assistant is instructed to use semantic markup, accessible controls, responsive CSS and working interactions, and to preserve unrelated features. It cannot execute tests or claim a working external backend. Structural validation is not a guarantee that generated code is correct.

## Source and preview

HTML is body markup, CSS is a complete stylesheet, and JavaScript is a browser script without script tags. Switch source tabs to edit each part. Tab inserts two spaces; Ctrl/Command Z and Shift Z undo/redo; Ctrl/Command S saves locally. The code pane can be hidden. Preview width switches between responsive, mobile and tablet layouts.

Preview runs in an iframe with `sandbox="allow-scripts allow-forms"` and an opaque origin. It cannot access the parent editor, its browser storage or same-origin APIs. A Content Security Policy blocks external script/style/image subresources, fetch, connections, workers and form submissions; inline CSS/JavaScript and data images are allowed. The form sandbox permission lets client-side submit handlers run; CSP still blocks actual form submissions. Existing script/document-resource tags in the HTML fragment are removed for preview; use the JavaScript editor for application behavior. Do not rely on localStorage inside the preview; use in-memory state.

The sandbox is not a general-purpose secure code-execution service: expensive/infinite JavaScript can consume browser resources, and it does not guarantee suppression of every self-navigation request. Parent navigation, popups and same-origin access are not granted. Keep preview code local and self-contained. **Stop** clears the frame.

Console log/warn/error messages, runtime errors and unhandled rejections appear below the preview and can be included in AI context for debugging. Diagnostics are capped at 100 entries. Messages are accepted only from the current preview frame and are displayed as text. They are debugging output, not trusted test results.

## Files and storage

- **Export HTML** downloads a complete standalone `index.html` equivalent with inline CSS and JavaScript. It has no editor UI, preview bridge or preview sandbox restrictions. Review the app's code before running or sharing the exported file.
- **Export ZIP** packages the standalone `index.html`, editable project JSON and a short README.
- **Save project** stores the editable app name, brief and three source sections as JSON. **Open project** restores that JSON after validation; imports can be undone. This is not an arbitrary website/ZIP importer.

Projects autosave locally. History and preview console logs last only for the current page session. Save backups because clearing browser storage removes the saved project. Limits: 300 KB per source section, 5,000 characters for the brief, and 1.5 MB per imported project. Chat has its own context limit; reduce large sources/attachments or disable document context for general questions.

## Verification

```sh
node appiX/project-test.cjs
```

Serve the repository on port 8010, then run `node appiX/browser-test.cjs` with Playwright and Chromium at `/usr/bin/chromium`. Tests cover starter interactions, script isolation, diagnostics, code/history/persistence, single-file export, tool-specific AI review/apply, explicit preview execution and invalid imports. AI responses are controlled fixtures; no paid provider call is made.

## AI provider failures

Restart the relay after updating backend code. Chat now distinguishes proxy denials, DNS failures, TLS verification, timeouts, invalid responses, empty answers and output token limits. A failed prompt stays in the input for retry.

If the proxy denies a provider connection, allow its hostname in the **relay server's** outbound network settings: Eden AI `api.edenai.run`, OpenAI `api.openai.com`, OpenRouter `openrouter.ai`, or Gemini `generativelanguage.googleapis.com`. A custom LiteLLM gateway needs its own host and a running service. Changing browser CORS settings does not fix relay-to-provider access.

Use **AI chat → Relay → Provider settings** to test the configured provider. If app generation reaches the output limit, increase **Max tokens** within your model's supported limit or request a smaller change. Truncated responses are rejected before they can become broken app proposals. For TLS failures, install the required CA trust on the relay machine; leave certificate verification enabled.

## Generate an app through chat

Enter a brief such as **tetris game**, click **Build with AI**, then **Send**. The brief becomes the actual request. AI chat defaults to **Build / edit app**, which instructs the provider to return a complete runnable app rather than advice. You can also type a short request directly into chat. A request for a different app replaces the starter; ordinary edits preserve unrelated behavior.

When the reply arrives, click **Review proposed edit**, inspect it, then **Apply reviewed edit**. Click **Run preview** to run the generated app. Generated JavaScript stays stopped until you run it. Switch the chat mode to **Ask a question** for explanations without app changes.

If the model supplies only advice in build mode, chat reports that no app was generated and preserves the request for retry. Single JSON proposals wrapped in Markdown and explanation are accepted, with the same schema, identifier and stale-document checks. Failed local requests are excluded from subsequent provider history; successful replies retain their proposed code so follow-up requests can refer to it.

Run `node appiX/generation-browser-test.cjs` for the short-request generation flow, proposal review/application, explicit preview execution, question mode and rejection checks. This uses a mock provider and does not certify a live model's generated game.

### The old generic error still appears after an update

The exact message `Provider request failed. Check endpoint, connectivity, TLS trust, network access and provider availability.` comes from the older Python relay. Updating appiX in the browser or pulling Git changes does not reload a running Python process.

On the computer running the relay:

1. Stop the existing server with Ctrl+C in its terminal.
2. From the repository root, run `git pull`, then `python3 server/server.py`. Preserve any previous `--port`, `--config`, `--search-config` and `--allow-origin` options so the editor reaches the same server and configuration.
3. Reload appiX, open **AI chat → Relay**, verify the URL and use **Test relay**. Old relays now show an update/restart warning; current relays also report a missing provider API key.
4. Open **Provider settings**, use **Save & activate** for your configured profile, and test the provider. Retry the app request. The updated relay reports the specific failure if a provider problem remains.

When the relay runs on your computer, check that computer's proxy, DNS and CA trust. This cloud development environment's outbound policy does not control your local relay.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## No-code SPA and logic designer

Choose **No-code designer → Create designer starter**. Your current source is preserved in Undo. Add components with the palette or drag palette items into a container. Select components in the canvas or Layers, change text, state bindings, parent container, colors, spacing, direction and typography. Duplicate, delete or reorder components. Available components include containers, headings, text, buttons, inputs, text areas, checkboxes, selects, lists and dividers. Edit initial state as JSON.

Add a logic workflow, choose its trigger component and event, and add ordered actions. Actions can set/increment/append/clear state, guard remaining steps with a condition, call an HTTP API, delay, show a status, navigate or download data. Use `{{state.name}}`, `{{event.value}}` or `{{steps.fetch-data.answer}}` in text and action values. An exact binding preserves the value type; interpolated text becomes a string. Earlier step outputs are available to later steps. Conditions stop the remaining workflow when the resolved value is false. Workflows execute in the browser while the page is open; they are not server-side schedulers or Azure Logic Apps resources.

The design canvas selects components without executing workflows. **Run preview** tests the real application in the existing isolated iframe. Networking stays blocked unless **Allow API calls in preview** is selected; browser CORS and mixed-content rules still apply. Do not put provider keys or other secrets into a browser app. Configure private API access through your own backend.

The optional `designer` object is stored with the project and included in AI context/schema. Validation regenerates HTML/CSS/JavaScript from the authoritative designer, preserving a consistent visual model. AI may edit the designer or replace the app with a source-only proposal. Typing directly into a generated source file detaches the visual model; Undo restores the prior designer. Source-only existing projects and exports remain compatible.

Example AI request:

> Keep this app in no-code mode. Add a customer-name input bound to state, a greeting and a button that increments a counter. Preserve the complete designer tree and workflows.

## Deployments

Open **Deploy / SDK**, choose the target and enter app/site and cloud project names. Download the ZIP, extract it, and follow `DEPLOY.md`. The UI displays the corresponding deployment command. The package includes a complete static `public/index.html`, a project backup, UI SDK and provider configuration. Only `public/` is deployed.

| Target | Generated configuration / launch |
| --- | --- |
| Local | `python3 serve.py`, listening on `127.0.0.1:8080` |
| Docker | nginx Dockerfile with SPA fallback; build/run commands in DEPLOY.md |
| Vercel | `vercel.json`, output directory and SPA rewrite |
| Netlify | `netlify.toml`, publish directory and SPA fallback |
| Cloudflare Pages | `wrangler.toml` and Pages deployment command |
| Google Firebase Hosting | `firebase.json`, `.firebaserc`, selected project and rewrite |
| Azure Static Web Apps | `staticwebapp.config.json` and SWA CLI deployment command |
| AWS S3 | `deploy.sh` syncs to an existing `S3_BUCKET`; hosting policy/CloudFront must be configured separately |
| AWS Amplify | `amplify.yml` for a connected repository or manual static upload |

Deployment packages do not execute cloud operations or create resources automatically. Install/authenticate the appropriate CLI and verify the chosen site/project. Cloud credentials stay outside the project. Local Python hosting serves static files; the Docker package provides history-path fallback. No cloud accounts or live deployments were used in automated verification.

## UI SDK

**Download UI SDK** exports `appix-sdk.js`, the visual model validator, JSON schema, `SDK.md` and a standalone example. There are no runtime dependencies or frontend build requirements.

```js
const design = AppixDesigner.validate(myDesignerDocument);
const app = AppixSDK.mount(document.querySelector('#app'), design);
app.on('step', observation => console.log(observation));
app.setState('count', 5);
await app.run('counter', {value: 'clicked'});
console.log(app.getState());
app.destroy();
```

The instance also exposes `getElement(nodeId)`; event subscriptions return unsubscribe functions. `destroy()` cancels pending HTTP/delay actions and cleans up the mounted UI. The exported app exposes its instance as `window.app`.

Additional checks: `node appiX/designer-test.cjs` and `BASE_URL=http://127.0.0.1:8000 node appiX/designer-browser-test.cjs`.

## Visual studio workspace

The designer now uses a dedicated library, artboard and inspector, with **Canvas** and **Logic** modes. The source-only sidebar is hidden while designing to leave more space. Choose a responsive, desktop, tablet or phone artboard; **Test app** opens the real isolated runtime below it and **Close preview** returns that space to design.

**Screens** are first-class parts of the visual model. Add, rename, duplicate or delete screens and choose the initial screen. A screen owns its component hierarchy; parents must remain on the same screen. **screen** workflow actions switch between them without leaving the app. The SDK exposes `navigate(screenId)` and `getScreen()`. This is internal screen navigation, not browser-history URL routing.

Choose a working **counter**, **two-screen landing page**, **task app**, **contact form** or **dashboard** template. The contact form demonstrates required inputs and submission locally; it does not send email. Add an HTTP action to connect it to a real backend. Component search, nested Layers, canvas selection, palette drag/drop and dragging existing components into containers all use the same validated tree.

Alongside the original components, the library includes **forms**, **images**, **badges** and **progress indicators**. Configure grid columns, flex direction/alignment, width, minimum height, spacing, typography and colors. Fields support email/number/date/password input types and required validation; buttons can submit a form. Raster images load from local/virtual disk (under 100 KB) or HTTPS; HTTPS resources require enabling API calls/resources in preview. Embedded SVG remains available through source editing rather than this image component.

Logic mode displays the event trigger and ordered action cards. Select a card to edit its properties, drag to reorder, or use the move/delete controls. The inspector provides state/event/prior-step binding chips, HTTP method/URL settings, screen destinations and condition comparisons (truthy, equals, not-equals, greater-than, less-than, contains). A false condition stops the remaining steps. Arbitrary custom JavaScript and background jobs belong in source mode or a backend.

Schemas, AI context, project backups, generated sources, deployment packages and the downloadable SDK include screens and the new component/action properties. Old one-screen projects migrate to a Home screen. The SDK documentation in generated exports describes the screen API.

Verify the complete studio flow with `BASE_URL=http://127.0.0.1:8000 node appiX/studio-browser-test.cjs`.

## Faster composition and responsive behavior

- **Responsive overrides** changes the selected component at tablet (up to 900px) or phone (up to 600px) widths. Empty values inherit base styles; phone styles layer over tablet styles. Preview widths simulate these same rules on the canvas, and exported apps apply them when the browser resizes. Reset removes the selected breakpoint’s overrides. The SDK adds `setViewport(numberOrNull)` for embedded previews; null follows browser width. Resizing preserves runtime state.
- **Copy component / Paste component** copies a subtree and its connected workflows between screens or appiX tabs in this browser. Paste remaps IDs, keeps state binding names and preserves existing destination state values. Screen navigation targets absent in the destination resolve to the active screen. Undo restores the prior tree. Ctrl/⌘ C/V/D and Delete operate on components when focus is outside text inputs, dialogs and chat.
- **Edit text on canvas** edits headings, paragraphs, buttons and badges directly. Enter saves, Shift+Enter adds a line, Escape cancels. Double-clicking a selected text component also edits it. Binding expressions are edited as expressions rather than being replaced by their current displayed value.
- **Component logic** selects an existing interaction or creates an event trigger for the component, then opens Logic mode.
- **Check design** reports missing initial state, image sources, accessible labels, empty workflows and references to actions that do not precede the current action. Jump to the component/action or initialize a missing state key. These setup checks complement testing the real app; they do not prove external API behavior.

Run `BASE_URL=http://127.0.0.1:8000 node appiX/refine-browser-test.cjs` to verify responsive runtime behavior, cross-screen copying, inline text editing and setup checks.

## Tool-specific productivity actions

Open **Workspace → Tool actions** for reviewed editing helpers, JSON/Markdown/CSV inventories and a tool-specific AI review draft. Changes use native validation and save recovery before application. See the [action catalog and interchange guide](../shared-suite/WORKSPACE.md#tool-actions-and-portable-inventories) for this app’s operations and limits.

Additional **Workspace → Tool actions** capability: Generate missing form-control labels from bindings or component IDs. Review the native change preview before applying; a recovery point is saved automatically.

**Productivity extension:** Initialize missing state bound to form controls while preserving existing state values and workflows. Use **Workspace → Tool actions** to review and apply native changes.

**Reusable variants:** Duplicate a no-code screen with copied components, parent links and component-bound workflows. Available through **Workspace → Tool actions**, with native validation, preview and recovery.

## Export a Rust project

Open **Deploy / SDK**, choose **Rust Cargo project**, enter the package name and
choose **Download deployment ZIP**. The normal export destination supports your
computer or the shared virtual disk. The ZIP includes `Cargo.toml`, `src/main.rs`,
`public/index.html`, the UI SDK, the editable appiX project, schema files and
`RUST.md` / `DEPLOY.md` instructions.

Extract it and run:

```sh
cargo test --offline
cargo run --offline
# Open http://127.0.0.1:8080
cargo build --release --offline
```

The package has no external crates. Rust embeds and serves the generated SPA;
HTML/CSS/JavaScript and no-code workflow logic remain browser-side, with no automatic
translation to Rust or generated database/auth/API. Rebuild after editing embedded
assets. `HOST` defaults to `127.0.0.1` and `PORT` to `8080`; for example,
`HOST=127.0.0.1 PORT=9090 cargo run --offline` (PowerShell uses `$env:PORT="9090"`).
The small standard-library server supports GET/HEAD, extensionless SPA deep links
and the embedded SDK. Unknown asset, encoded and dot-prefixed paths are rejected.
Only the exported index and SDK are served; add explicit routes for additional
local assets. It handles one bounded-time connection at a time; use a production
HTTP/TLS server or proxy for a production/high-concurrency deployment.

Run `node appiX/rust-export-test.cjs` for package-generation checks. With Rust/Cargo
installed and the suite server running, use
`BASE_URL=http://127.0.0.1:8000 node appiX/rust-export-browser-test.cjs` to generate
the ZIP, compile/test it offline, start the binary and exercise the exported UI.
Set `CARGO` to a Cargo executable path if it is not on PATH. The suite gate's
optional `--rust` flag includes that test.

## Project ZIP

Use **Project ZIP** in the header, or **Workspace → Recovery → Import / export project ZIP**, to save and restore the complete native project. Choose Computer or Virtual disk. Imports validate and stage a review; applying preserves the previous project in Recovery. Embedded assets are included, while separate app/relay settings and external workspace files are excluded. See the [shared ZIP guide](../shared-suite/PROJECT-ZIP.md).

## Install a project on the suite desktop

Choose **Add to desktop** in the header. Set the tile name, description and logo; then save it. codeiX projects require a static HTML entry point and bundled browser-compatible code. appiX uses the current generated app, including no-code designer output. The installer captures a snapshot; later editor changes are published by choosing **Update …** in the same dialog.

From the desktop tile's **App settings**, edit its metadata/logo or remove it. Standard apps are protected. The runner's **Edit source project** action loads the saved source into its original editor after confirmation. Added apps are stored only in this browser/origin, run in an isolated frame, and have optional HTTPS network access. Export the source project separately for backup. See [desktop app installation](../README.md#add-your-own-desktop-apps).
