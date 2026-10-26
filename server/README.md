# Shared desktop suite server

From the repository root:

```sh
python3 server/server.py
```

Python 3 and its standard library are sufficient. The default bind address is `127.0.0.1`, port **8000**. `python3 -m server` is equivalent. Open any tool's directory path on this server, and `/relay` for AI provider configuration.

The backend combines static hosting for all tools, the AI provider relay (`/api/chat`, `/api/health`, `/api/admin/*`), and reportiX crawling, Google search configuration and research (`/api/research`, `/api/research/settings`, `/api/research/health`). The existing frontend API contracts remain compatible.

```sh
python3 server/server.py --port 8010 \
  --config /path/to/providers.json \
  --search-config /path/to/search.json
```

Both configuration defaults are unchanged: `$XDG_CONFIG_HOME/architex-relay/providers.json` and `$XDG_CONFIG_HOME/reportix/search.json`, with `~/.config` as the fallback configuration home. Existing credentials require no migration. Keep private files outside the served repository; direct static access to either configured file is blocked. Google environment overrides `REPORTIX_GOOGLE_API_KEY` and `REPORTIX_GOOGLE_ENGINE_ID` remain supported.

For a separately hosted frontend, repeat `--allow-origin https://your-exact-app-origin` as needed for AI chat. Provider administration and web research remain restricted to the server's own local origin. `--bind` changes the listening interface; use the loopback default for normal local use.

## Complete startup parameter reference

Run `python3 server/server.py --help` for the installed version. The same flags work with `python3 -m server`, `architex/server.py` and `reportiX/server.py`. Server settings can also be saved from **Server settings** on `/relay`. The private JSON file defaults to `server-settings.json` beside the startup provider configuration; choose a fixed location with `--server-config PATH`. Startup precedence is built-in defaults, saved server settings, then explicit command-line flags (including replacement of saved repeatable allowlists). There is no automatic `.env` loader. Relative paths resolve from the process working directory; the default suite/workflow workspace is the repository root regardless of that directory. Use absolute paths for private configuration.

| Parameter | Default | Meaning |
| --- | --- | --- |
| `-h`, `--help` | — | Print usage and exit without starting services. |
| `--server-config PATH` | `server-settings.json` beside the startup provider configuration | Private persistent server settings. Fields use the CLI destination names, such as `agent_workspace`, `allow_origin` (array), and `agent_no_commands` (boolean). |
| `--bind ADDRESS` | `127.0.0.1` | Listening interface. `0.0.0.0` exposes the server on all IPv4 interfaces; it does not enable TLS or authorize remote administration. |
| `--port INTEGER` | `8000` | Listening port. `0` asks the OS for an available port; the startup message reports it. The reportiX compatibility launcher defaults to `8010`. |
| `--config PATH` | `$XDG_CONFIG_HOME/architex-relay/providers.json` | Private text-provider profiles. With no `XDG_CONFIG_HOME`, use `~/.config/architex-relay/providers.json`. A missing file starts with built-in provider presets; set credentials in `/relay` or create the JSON file. |
| `--search-config PATH` | `$XDG_CONFIG_HOME/reportix/search.json` | Private Google Programmable Search credentials. Missing configuration disables Google discovery until configured; it does not stop the editors. |
| `--allow-origin ORIGIN` | No additional origins | Repeat for separately hosted chat/image frontends, e.g. `https://tools.example.com`. Exact scheme, hostname and optional port only; no paths, credentials or wildcards. Combines with provider JSON `allowedOrigins`. Same-origin chat needs no entry. Does not enable remote agent, workflow, catalog, research or administration routes. |
| `--allow-workflow-command EXECUTABLE` | None; workflow commands disabled | Repeat to allow automatextiX command steps. Executables must be discoverable on `PATH` or supplied by path. This list is separate from the coding-agent command list. |
| `--workflow-cwd DIRECTORY` | Repository root | Existing working directory for workflow commands. Must exist even if no workflow command is enabled. |
| `--agent-workspace DIRECTORY` | Repository root | Existing server-side workspace for coding-agent files and commands. Private run state is stored in its `.suite-agent/` directory. This is separate from the browser's codeiX/appiX project and virtual disk. |
| `--disable-agent` | False | Disable the coding runtime and its commands. Hosting, relay, research and shared catalog remain available. No workspace directory is required for a disabled runtime. |
| `--agent-no-commands` | False | Disable coding-agent terminal execution while keeping its other runtime capabilities available. File edits still depend on the session's permissions. Overrides any command allowlist. |
| `--agent-allow-command EXECUTABLE` | Auto-detected Python interpreter plus installed `node`, `npm`, `git` | Repeat to **replace**, not extend, the default coding-agent executable list. Every explicitly named executable must exist. When frozen, Python candidates are installed `python3`/`python`, not the sidecar binary. Ignored when commands/the agent are disabled. |
| `--agent-navigation-dir DIRECTORY` | `SUITE_AGENT_NAVIGATION_DIR`, otherwise bundled `server/code-navigation/` | Trusted directory containing `service.cjs` and its installed `node_modules/typescript`. Python AST navigation is built in; full JS/TS analysis needs Node and `npm ci --prefix server/code-navigation`. CLI overrides the environment value. |
| `--agent-embedding-dir DIRECTORY` | `SUITE_AGENT_EMBEDDING_DIR`, otherwise off | Prepared local `model.onnx`, `tokenizer.json`, `manifest.json` with matching hashes. Requires `server/requirements-agent.txt`. Enables learned session-memory embeddings; startup never downloads a model. The shared skill catalog remains a separate hashed lexical vector index. Ignored when the coding runtime is disabled. |
| `--skills-db PATH` | `skills/catalog.sqlite3` beside `--config` | Private shared skill index, app skill profiles, edits and history. Its parent is created automatically. This is separate from learned workspace-local agent skills. |
| `--skills-offline` | False, unless `SUITE_SKILLS_OFFLINE=1` | Use bundled/cached catalog content without remote source refresh. Does not disable provider calls, research or all server networking. |

Command allowlists restrict executable names, not what an allowed interpreter can do. Commands inherit the server account's OS permissions; directories and allowlists do not provide an OS sandbox. Browser session permissions, review/takeover choices, run step budgets and paging are configured in the UI, not by additional server flags.

### Environment variables and precedence

| Variable | Effect |
| --- | --- |
| `XDG_CONFIG_HOME` | Base directory for the two default private provider/search paths. Explicit `--config` and `--search-config` override those paths. |
| `REPORTIX_GOOGLE_API_KEY` | Nonempty value overrides `search.json`'s `apiKey`. |
| `REPORTIX_GOOGLE_ENGINE_ID` | Nonempty value overrides `search.json`'s `engineId`. |
| `SUITE_SKILLS_OFFLINE` | Exactly `1` forces offline catalog refresh, even without the flag. Unset it and omit `--skills-offline` to enable refresh. |
| `SUITE_AGENT_NAVIGATION_DIR` | Default for `--agent-navigation-dir`. |
| `SUITE_AGENT_EMBEDDING_DIR` | Default for `--agent-embedding-dir`. |
| `PATH` | Used to discover command executables and Node for compiler navigation. |
| `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` (and standard lowercase variants) | Standard Python HTTP-client proxy handling where applicable. Set `NO_PROXY=localhost,127.0.0.1,::1` when local connections must bypass a proxy. |
| `SSL_CERT_FILE`, `SSL_CERT_DIR` | Standard OpenSSL/Python CA trust configuration for HTTPS clients using the default SSL context. |
| `REQUESTS_CA_BUNDLE` | CA bundle override for the optional `requests`-based Google ID-token verifier. It does not configure all urllib clients. |

Provider API keys are stored in profile JSON or set through `/relay`; the server does not automatically read `OPENAI_API_KEY` or `GEMINI_API_KEY`. A locally running LiteLLM gateway may have its own environment configuration. Restart after changing startup flags or environment variables.

### Configuration files and all supported fields

| File | Fields / purpose |
| --- | --- |
| Text providers (`--config`) | Root: `format: "architex-relay-providers"`, `version: 1`, `activeProfileId`, `profiles`, `allowedOrigins`. The legacy format name `architex-provider-configs` is also accepted. Each profile: `id`, `provider`, `name`, `protocol`, `endpoint`, `model`, `apiKey`, `upstreamProvider`, `maxTokens`, `tokenLimitEnabled`, `temperature`. |
| Images (`<provider-stem>.images.json`) | `generationEndpoint`, `editEndpoint`, `model`, `apiKey`. Derived automatically from `--config`; e.g. `providers.json` → `providers.images.json`. No image-config CLI flag. |
| Search (`--search-config`) | `apiKey`, `engineId`. The settings API additionally accepts `clearKey: true` as a save action; it is not needed in the file. |
| Shared catalog (`--skills-db`) | SQLite, managed by the skill-set/catalog UI. Do not replace it with JSON. |
| Agent state (`<workspace>/.suite-agent/`) | Managed run snapshots, recovery copies, scripts, logs and SQLite memory/skill/workflow libraries. Not a server settings file. |

Text providers allow 1–30 profiles with unique IDs. `provider` is `openai`, `gemini`, `litellm`, `edenai` or `openrouter`; `protocol` is `openai`, `gemini` or `eden-v2`. `maxTokens` is an integer 1–32768; `temperature` is 0–2. `tokenLimitEnabled` is boolean and defaults to true when omitted. When false, the provider output-limit field is omitted; the remembered numeric value must still be valid. `upstreamProvider` is primarily for legacy Eden v2. GPT-5 OpenAI-compatible deployments use `max_completion_tokens` and omit temperature. Endpoints are complete HTTPS URLs, or loopback HTTP URLs for local gateways; include required query parameters. Keys are plain values without a `Bearer ` prefix. Models, API availability and quotas are provider-specific.

Changing `--config` also changes default image, device and shared-catalog paths unless the latter two are explicitly overridden. Provider profiles are loaded at startup; use `/relay` for live changes or restart after hand-editing them. Browser paging settings in `/relay` and agent run controls are stored by the browser and are not fields in `providers.json`. See the [complete configuration example](../README.md#complete-server-configuration-example).

### Native wrapper-only option

`desktop-tauri/scripts/backend_entry.py --suite-root DIRECTORY` selects the staged public suite resource directory and requires an `index.html`. The wrapper consumes this required option before forwarding the normal flags above. It is not accepted by `server/server.py`. The private stdin `shutdown` message is a lifecycle command, not a CLI flag. The Tauri launcher chooses its own loopback port, private data paths and workspace; see [desktop packaging](../desktop-tauri/README.md).

## What changed

Previously, `architex/server.py` provided static hosting and AI chat. `reportiX/server.py` inherited that handler and added crawling and Google search settings. Running both duplicated hosting and split capabilities across ports.

The suite HTTP/provider implementations live here; headless agent implementations live in [`codingagentlib/`](../codingagentlib/README.md), with compatibility imports retained here: `server.py` handles research routes and startup, `relay.py` handles AI routes, `relay_config.py` handles provider adapters and credentials, and `crawler.py` / `google_search.py` handle web research. The old application-side Python files are compatibility wrappers. Both old launch commands now run the full unified backend; their original default ports (8000 and 8010) are preserved. One running server serves the entire suite.

## Verification

```sh
python3 architex/server-test.py
python3 -m unittest discover -s reportiX -p '*_test.py'
python3 -m unittest discover -s server -t . -p '*_test.py'
```

## Optional workflow command runner

`automatextiX` Command line steps are disabled unless you pass `--allow-workflow-command EXECUTABLE` (repeatable). Use `--workflow-cwd DIRECTORY` to select the working directory; otherwise the repository root is used. Only local same-origin suite requests can access `/api/workflow/health`, `/api/workflow/command` and `/api/workflow/cancel`; relay CORS permissions do not enable these routes.

Commands receive an argument array and stdin with `shell=False`, bounded runtime/output and explicit per-run browser confirmation. The allowlist and working directory do not sandbox interpreter code or restrict the server account's filesystem permissions. See [workflow command setup and limits](../automatextiX/README.md#enable-local-commands) before enabling trusted programs. Existing static, chat and research features work with command execution disabled.

## Versioned OpenAI-compatible gateways

The provider endpoint is the **complete URL**, including required query parameters such as `?api-version=2025-04-01-preview`. These parameters are preserved when saving and making requests. URL user-info credentials, fragments, whitespace/control characters and remote plain HTTP remain rejected. Put Bearer tokens in the API key field, without the `Bearer ` prefix.

For OpenAI-compatible GPT-5 models (model names beginning with `gpt-5` or `openai/gpt-5`, or a GPT-5 deployment path), the relay sends `max_completion_tokens` and omits `temperature`. The existing Maximum output tokens field controls that limit. Other OpenAI-compatible models retain the previous `max_tokens`/temperature behavior. Restart the relay process after updating its Python code; refreshing the provider settings page alone does not load backend changes.

### Optional output-token limit

In `/relay`, uncheck **Limit output tokens**, then **Save & activate** to omit the output-token parameter for that provider profile. This omits `max_tokens`, GPT-5's `max_completion_tokens`, or Gemini's `maxOutputTokens`, according to the protocol. The provider's own defaults and hard limits still apply. Re-enabling the switch restores the remembered Maximum output tokens value.

The setting is saved/exported/imported as `tokenLimitEnabled: false`. Existing configurations without this field keep their previous enabled limit. Restart the relay after updating the backend, then refresh the provider settings page to use the new switch.

## Workspace coding agent

Use the **Coding agent** tab in AI chat for iterative code inspection, file editing, managed scripts and real terminal execution. See the [runtime setup and workflow](../shared-agent/README.md) for startup flags, permissions, session recovery and verification.

Coding-agent commands are enabled by default for installed Python, Node.js, npm and Git, with the suite repository as workspace. Override with `--agent-workspace` and repeated `--agent-allow-command` flags; disable commands with `--agent-no-commands`, or the whole runtime with `--disable-agent`. Commands run with the server process’s OS permissions.

## Shared app skills

The server also starts the [shared skill vector catalog](../docs/SHARED-SKILLS.md)
for chat and coding-agent retrieval. Use the **Skill set** UI to edit each app's
standard set. `--skills-db` selects the private SQLite path; `--skills-offline`
uses the bundled/cached snapshot without network refresh. Restart the server and
reload the apps after upgrading this feature.

### photiX image API

`POST /api/images` relays generation/edit requests to the separately configured OpenAI Images-compatible provider. Configure it in `/relay` → **photiX image provider**. Credentials stay in `<provider-config-stem>.images.json`, blocked from static serving. `/api/admin/images` reads/saves redacted settings with the existing localhost administration header/origin policy. App calls use `X-Architex-Request: 1` and the same exact allowed-origin policy as text chat. See [photiX](../photiX/README.md) for supported protocols and limits. Restart the server after updating.

### Optional native desktop lifecycle

The Tauri 2 wrapper in `desktop-tauri/` freezes this server with PyInstaller and provides a read-only suite root plus a writable app-data workspace/configuration directory. Its private stdin channel requests a graceful stop through `main(shutdown_event=...)`; ordinary browser/server startup is unchanged. Frozen defaults detect installed interpreters instead of treating the sidecar executable as Python. See [desktop guide](../desktop-tauri/README.md).

## Advanced coding-agent analysis

The runtime now offers compiler/AST code navigation, optional local learned sentence embeddings, validated task dependency graphs, and an optional independent completion reviewer. See [techniques and setup](../shared-agent/TECHNIQUES.md) for installation and limits. `--agent-navigation-dir` / `SUITE_AGENT_NAVIGATION_DIR` select a trusted external TypeScript service installation. `--agent-embedding-dir` / `SUITE_AGENT_EMBEDDING_DIR` select prepared local ONNX model files; normal startup never downloads weights. The [provider-backed evaluation runner](../evaluations/coding-agent/README.md) is opt-in and uses fresh fixture workspaces.

## Multimodal chat

`POST /api/chat` accepts validated native image, WAV/MP3 audio and PDF content parts, plus optional `modalities` (`["text","image"]` or `["text","audio"]`). OpenAI-compatible adapters forward native parts; Gemini converts them to MIME-typed inline data. Replies preserve text and normalized media without automatically fetching provider-hosted URLs. Legacy Eden v2 remains text-only. Restart after upgrading. See [protocol coverage and usage](../shared-ai/MULTIMODAL.md).


### Approved runtime server settings

Open `/relay` → **Server settings**. Edit the fields, select **Review changes**, inspect the before/after values, then check the approval box and select **Approve and apply changes**. Editing, reviewing, closing or cancelling does not apply anything. Approval tickets expire after five minutes and are tied to the current settings revision; a new review invalidates the previous ticket.

Additional trusted origins, coding-agent command enablement/allowlists, workflow command allowlists and workflow working directory apply immediately after approval. Live changes are rejected while an agent session is running or an agent/workflow request is in flight; pause or finish the work first. This does not terminate jobs or silently replace an active workspace. Provider-level allowed origins remain separately configurable in their existing panel.

Listener bind/port, coding-agent workspace/enablement, navigation/embedding directories, skill catalog/offline settings and private configuration file locations are saved for the next restart. The dialog lists pending restart fields and keeps the effective values separate from saved values. Restart using the same `--server-config` location. Explicit startup flags continue to override saved values; remove those flags if you want saved settings to win. `SUITE_SKILLS_OFFLINE=1` still forces offline operation. Configuration path changes also affect dependent default paths as described above.

The JSON uses the field names returned by `/api/admin/server-settings` (`action: "read"`); optional paths and the automatic agent command list are `null`. Saves are atomic and owner-only. Server settings contain paths and permissions, not provider API keys. The file and temporary save files cannot be downloaded through static hosting. Administration requires the same localhost origin and `X-Architex-Admin: 1`; apply requires a previously reviewed ticket and `approved: true`.
