# Architecture chat and AI relay

Architex has one AI setting: the **relay server URL**. Providers, models, endpoints, API keys, active-profile selection, connection tests, imports and exports belong exclusively to the relay server and its own UI. The browser never constructs a provider request or receives a provider key.

## Start and configure the relay

From the repository root:

```sh
python3 server/server.py
```

Open `/relay` on that server to configure providers. Open `/architex/` for the architecture workspace. There are no Python package dependencies.

The relay UI includes example profiles for Eden AI, OpenAI, Gemini, LiteLLM and OpenRouter. Select a profile, edit its endpoint/model, enter its key, then **Save & activate**. **Test active provider** sends a small probe without architecture data. Eden uses `https://api.edenai.run/v3/llm/chat/completions` with example model `openai/gpt-4o-mini`; use a model available to your account. Legacy Eden v2 is also supported. Provider examples are editable; loading one does not make a provider call.

Provider configuration is persisted on the relay in `~/.config/architex-relay/providers.json` (or under `XDG_CONFIG_HOME`). Use `--config /path/to/providers.json` for a different location. The file is saved atomically with owner-only permissions. It must be backed up as a credential. The server never serves this file through its static routes, even if a custom location is inside the web root.

Saved keys are not returned to the relay UI: it receives only a `hasApiKey` indicator. Leave the key field empty to retain the stored key; check **Remove stored API key** to clear it. Changing the provider endpoint/protocol clears an omitted stored key. The UI does not use browser localStorage for credentials.

**Import configuration** replaces the server library. It accepts `architex-relay-providers` version 1 and previous `architex-provider-configs` exports for migration. Imported keys, if present, are persisted on the relay. **Export configuration** omits keys by default; explicitly select **Include API keys** for a credential-bearing export. An Eden example is in [examples/eden-ai-provider.json](examples/eden-ai-provider.json).

## Connect Architex

Open **AI relay** on the desktop (or **Relay** in AI chat), enter the relay origin (for example `http://localhost:8000`), and select **Save relay URL → Test relay**. **Open provider settings** opens the server's separate administration UI. Architex stores only this URL as its active AI configuration. If older browser provider settings exist, a one-time migration section offers their original JSON for download/import into the relay UI and explicit removal from the browser. They are preserved as opaque legacy data until removed, and are never loaded for chat or sent to the agent. The migration file may contain previously remembered keys. Keys that existed only in memory must be entered again on the server.

Architex never falls back to a direct provider request. Its chat POST contains only:

```json
{"messages":[{"role":"system","content":"Structured architecture handover"},{"role":"user","content":"Requested change"}]}
```

The relay selects its active provider, constructs authentication and the provider-specific payload, forwards it server-side, and returns normalized `{"text":"..."}` JSON. Architex knows no provider endpoints, keys, protocols, or provider configuration. The health response identifies protocol version 2. Old caller-supplied `url`/`headers`/`body` relay requests are rejected.

## Separate origins and CORS

For Architex hosted at another origin, enter its exact origin in the relay UI's **Allowed Architex origins** section. For example `https://bdug.github.io`, excluding the repository path. Architex settings show the origin to allow. Alternatively use:

```sh
python3 server/server.py --allow-origin https://bdug.github.io
```

Repeat the flag for multiple origins. CLI origins are additive to the saved UI list and require a server restart to remove. Set Architex's relay URL to `http://localhost:8000`. A browser may ask permission to access the local network; grant it for the app if required. If a port is occupied, use `--port 8001` and update the URL.

Only health and chat routes expose CORS to explicitly permitted origins. OPTIONS and private-network preflights are supported; wildcard/null/unrelated origins are rejected. Provider administration routes require the relay's own local origin and a custom administration header. An origin authorized for chat cannot read or change provider configuration. No public CORS proxy is used. Upstream TLS verification and redirect blocking remain enabled. The default relay binds to loopback and is intended for a local trusted user; do not expose its administration UI publicly.

## Structured model round trip

Architex uses the shared desktop chat integration. With document context enabled, each structured request includes complete `metamodel`, `instanceModel` and `ruleLibrary` snapshots, selection/validation context, attachments, the bundled schema catalogue, and the separate editable `llm-handover.md` template. Retained Sphinx source files are excluded. Turn off document context for questions without workspace data; edits require it.

The shared response is JSON containing `requestId`, `documentDigest`, `answer`, `summary` and `proposal`. For questions, proposal is null. For edits, proposal contains metamodel, instanceModel and/or ruleLibrary changes. Omitted sections and fields are preserved from the request snapshot; supplied arrays replace whole collections. A supplied rule library must be complete. Request identifiers and the current workspace snapshot are checked. Combined model references, connection policies and active blocking rules are checked before application. New or changed rule scripts stay disabled.

**Agent call output** shows the raw response. **Download request** saves the structured handover; **Download API / schema** exports the tool contract. Provider credentials never enter the handover.

## Chat files and conversation

**Attach files** adds uniquely named UTF-8 reference files (no application file-count, per-file-size or total chat request-size limit). Files can be removed and remain in page memory. Browser memory and the selected provider’s context limits still apply. Restart the relay after updating its code to remove its former 2 MB incoming chat limit. Replies are displayed as plain text. **New conversation** clears previous messages, pending proposals and raw output, retaining the current document and attachments. The next request excludes earlier messages. **Undo AI edit** restores the previous models and rules while the workspace still matches the applied edit.

## Validation

- `python3 architex/server-test.py`: provider protocol adapters, server-owned credentials, redacted administration responses, private persistence, origin rules and relay requests.
- `node architex/cors-browser-test.cjs`: real relay UI configuration, stored-key handling, allowed origins, export and actual cross-origin chat against an upstream without CORS.
- `node architex/ai-test.cjs`: client proposal/rule validation and absence of provider adapters.
- `node architex/shared-chat-browser-test.cjs`: shared chat launch, model/rule/schema handover, history reset, reviewed edits, Undo, invalid references and compatibility with other apps.

Tests use local mock upstreams. Live provider credentials, account model availability, quota and production responses must be verified with **Test active provider** in the relay UI.

AI chat replies have no application response-size limit in the shared chat UI, codeiX chat or relay. Restart the relay after updating to remove the former 2 MB provider-response cap. Provider token configuration, model limits, external network timeouts and available memory still apply.

The shared chat and codeiX do not automatically abort long AI requests; the relay also waits without an application timeout. Use **Stop** to cancel in the chat. External provider/proxy timeouts can still occur. The shared chat panel scrolls on small screens so messages and controls remain reachable.

Architex chat explicitly supplies modelSchemas.metamodel and modelSchemas.instanceModel for document sections. The editable proposal schema uses the same component, port, dependency, instance and connection definitions, allowing omitted unchanged fields. File-exchange wrapper schemas remain reference material. Normalized proposals are checked against both section schemas and combined model references before review/application. Model schemas are also included in the downloadable agent API.

Use **Questions & proposals** for a multi-turn architecture discussion. Ask about the current models, request a change, discuss the pending proposal, and refine it before applying. Later turns distinguish proposed changes from the actual workspace, including applied/undone and stale proposal status. **New conversation** resets this discussion history.
