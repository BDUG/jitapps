# Two views, one agent — Python, JavaScript/TypeScript and Rust

Three native SDK implementations share a browser presentation. Each registers
`svg_color` (SVG circle color) and `rich_text` (paragraph replacement in a styled
rich-text document). SDK edit permissions gate both handlers. Chat can select
both tools in one model-driven run. User messages, full model requests/responses,
public plans, step boundaries, observations and terminal results appear below the
views and export as JSON. These are public events, not private model reasoning.

From the repository root:

```sh
python3 codingagentlib/examples/two-views/serve.py python
# Or the JavaScript implementation of the JavaScript/TypeScript SDK (Node 18+):
python3 codingagentlib/examples/two-views/serve.py javascript
# Or native Rust (build first):
cargo build --locked --manifest-path codingagentlib/rust/Cargo.toml --example two_views
python3 codingagentlib/examples/two-views/serve.py rust
```

Open **http://127.0.0.1:8765**. Only one host uses that port at a time; use
`--port 8766` for another. Python 3.10+ hosts the UI for every language. Rust's
tool execution is native and Node executes JavaScript tools; neither delegates
tools to Python. No suite relay, workspace, filesystem tools or npm install is
needed. The JavaScript/TypeScript SDK example uses runnable CommonJS JavaScript;
TypeScript consumers can call the same `EmbeddedAgent` API.

Default model: a deterministic callback accepts `svg_color purple` or
`rich_text Hello world`. This mode makes no AI calls. Invalid colors produce
failed tool observations; malformed commands produce a clarification question.
Each Send starts a fresh SDK run with the current document as context; the UI
retains all runs in its export. State and traces live in the page until reload.
The rich text example edits paragraph content, preserving the heading and styling;
it is not an arbitrary HTML or document-import editor.

For natural-language AI chat, configure an OpenAI-compatible chat-completions
endpoint supporting JSON-object responses before launching any host:

```sh
export TWO_VIEWS_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions
export TWO_VIEWS_MODEL=your-installed-model
# Optional: set TWO_VIEWS_API_KEY in the host environment for authenticated endpoints.
python3 codingagentlib/examples/two-views/serve.py rust
```

Try “Make the circle green and rewrite the note as a welcome message”. The host
sends model requests to the configured endpoint and passes replies back to the
selected language's SDK, which validates and executes actions within a three-step
budget (two edits plus completion). The provider must return the SDK JSON response
contract, not native provider tool-call envelopes. Model callbacks and host tools
are separate. Credentials stay in the server; document text and trace context go
to the configured provider. Trace exports include document content.

Files:

- `verify.py`: deterministic and mocked-provider HTTP integration checks.
- `serve.py`: loopback HTTP UI and optional provider bridge; no SDK tool execution.
- `index.html`: SVG/rich text rendering, chat, trace display and JSON download.
- `python.py`: Python `EmbeddedAgent`, native tool handlers and model callback.
- `javascript.cjs`: Node `EmbeddedAgent`, native tool handlers and model callback.
- `../../rust/examples/two_views.rs`: Rust `EmbeddedAgent` and native tool handlers.

No imported SVG/HTML or model text is executed: SVG uses a fixed shape with an
allowlisted color; paragraph and logs use text rendering. The server accepts edit
requests only from its exact loopback origin. Keep the server bound to loopback.
Live-provider behavior and browser rendering require separate verification.
The repository records a real containerized Chromium flow in the
[extension verification report](../../../specs/APPS-STATUS-REPORT.md); this does
not establish behavior with a particular live model.

Verification (build Rust first):

```sh
python3 codingagentlib/examples/two-views/verify.py
```

The trace panel updates after each bounded run returns; this example does not
stream provider tokens or SDK events during an active request.


For the request/response/observation sequence and export contents, see the
[handbook walkthrough](../../../docs/coding-agent-book/HANDBOOK.md#7-two-view-ui-and-message-trace).
The [Python extension pack](../../extension_pack/README.md) is a separate generic
SDK integration; these three `EmbeddedAgent` examples do not automatically enable
its checkpoint store, verification lattice or model-budget ledger.
