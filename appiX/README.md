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
