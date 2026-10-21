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

## What changed

Previously, `architex/server.py` provided static hosting and AI chat. `reportiX/server.py` inherited that handler and added crawling and Google search settings. Running both duplicated hosting and split capabilities across ports.

All backend implementations now live here: `server.py` handles research routes and startup, `relay.py` handles AI routes, `relay_config.py` handles provider adapters and credentials, and `crawler.py` / `google_search.py` handle web research. The old application-side Python files are compatibility wrappers. Both old launch commands now run the full unified backend; their original default ports (8000 and 8010) are preserved. One running server serves the entire suite.

## Verification

```sh
python3 architex/server-test.py
python3 -m unittest discover -s reportiX -p '*_test.py'
python3 -m unittest discover -s server -p '*_test.py'
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

Use **Workspace agent** in AI chat for iterative code inspection, file editing, managed scripts and real terminal execution. See the [runtime setup and workflow](../shared-agent/README.md) for startup flags, permissions, session recovery and verification.

Coding-agent commands are enabled by default for installed Python, Node.js, npm and Git, with the suite repository as workspace. Override with `--agent-workspace` and repeated `--agent-allow-command` flags; disable commands with `--agent-no-commands`, or the whole runtime with `--disable-agent`. Commands run with the server process’s OS permissions.
