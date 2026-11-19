"""Command-line interface for ReactAgent, PythonEnvironments, ScriptLibrary and MemoryManager."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import urllib.request

from .python.agent_runtime import Runtime
from .python.providers import openai_model
from .python.react import ReactAgent


def _http_post_json(url, body, headers):
    request = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers=headers, method='POST')
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode('utf-8'))


def _print(value):
    print(json.dumps(value, indent=2, ensure_ascii=False))


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m codingagentlib.cli', description=__doc__)
    parser.add_argument('--workspace', default='.', help='Target workspace directory')
    parser.add_argument('--allow-command', action='append', default=[], help='Allowlisted executable (repeatable, or *)')
    sub = parser.add_subparsers(dest='group', required=True)

    # ------------------------------------------------------------------ react
    p_react = sub.add_parser('react', help='Run ReactAgent against an OpenAI-compatible endpoint')
    p_react.add_argument('--goal', required=True)
    p_react.add_argument('--endpoint', default=os.environ.get('CODINGAGENT_ENDPOINT', 'http://127.0.0.1:8000/v1/chat/completions'))
    p_react.add_argument('--model', default=os.environ.get('CODINGAGENT_MODEL', 'gpt-4o-mini'))
    p_react.add_argument('--api-key', default=os.environ.get('OPENAI_API_KEY', ''))
    p_react.add_argument('--allow-edits', action='store_true')
    p_react.add_argument('--allow-commands', action='store_true')
    p_react.add_argument('--no-remember-sessions', action='store_true', help='Disable recalling and persisting session memory')
    p_react.add_argument('--decision-endpoint', default=None, help='Optional OpenAI-compatible endpoint for a decision model')
    p_react.add_argument('--decision-model', default=None, help='Optional decision model ID')
    p_react.add_argument('--decision-api-key', default=os.environ.get('OPENAI_API_KEY', ''))
    p_react.add_argument('--decision-mode', choices=['auto', 'off', 'assist', 'gate'], default='auto')
    p_react.add_argument('--max-steps', type=int, default=40)

    # -------------------------------------------------------------------- env
    p_env = sub.add_parser('env', help='Manage uv / venv Python environments')
    p_env.add_argument('action', choices=['list', 'status', 'create', 'install', 'uninstall', 'packages', 'freeze', 'remove'])
    p_env.add_argument('--name', default='default')
    p_env.add_argument('--python', default=None)
    p_env.add_argument('packages', nargs='*')

    # ---------------------------------------------------------------- scripts
    p_scr = sub.add_parser('scripts', help='Inspect, run or manage the script library')
    p_scr.add_argument('action', choices=['list', 'search', 'read', 'save', 'run', 'stats', 'export', 'import'])
    p_scr.add_argument('--id')
    p_scr.add_argument('--query')
    p_scr.add_argument('--file')
    p_scr.add_argument('--env', default='default')
    p_scr.add_argument('--input', default='{}')
    p_scr.add_argument('--tags', default='')
    p_scr.add_argument('--description', default='')
    p_scr.add_argument('--expected-revision', type=int, default=None)

    # ----------------------------------------------------------------- memory
    p_mem = sub.add_parser('memory', help='Manage long-term agent memory and memory architectures')
    p_mem.add_argument('action', choices=['remember', 'recall', 'forget', 'list', 'read', 'stats', 'consolidate', 'export', 'suite-stats', 'research'])
    p_mem.add_argument('--id')
    p_mem.add_argument('--kind', default='fact')
    p_mem.add_argument('--title')
    p_mem.add_argument('--content')
    p_mem.add_argument('--query')
    p_mem.add_argument('--tags', default='')
    p_mem.add_argument('--importance', type=float, default=None)
    p_mem.add_argument('--pinned', action='store_true')

    args = parser.parse_args(argv)
    commands = args.allow_command or ([n for n in ('uv', 'python3', 'python') if shutil.which(n)] if args.group in ('env', 'scripts') else [])

    if args.group == 'react':
        model = openai_model(endpoint=args.endpoint, model_id=args.model, api_key=args.api_key, request=_http_post_json)
        decider = openai_model(endpoint=args.decision_endpoint or args.endpoint, model_id=args.decision_model, api_key=args.decision_api_key, request=_http_post_json) if args.decision_model else None
        with ReactAgent(args.workspace, commands, decision_model=decider, decision_mode=args.decision_mode) as agent:
            result = agent.run(args.goal, model, allow_edits=args.allow_edits, allow_commands=args.allow_commands, remember_sessions=not args.no_remember_sessions, max_steps=args.max_steps)
        _print(result)
        return 0

    runtime = Runtime(args.workspace, commands)
    try:
        if args.group == 'env':
            _print(runtime.dispatch({'op': 'python_env', 'action': args.action, 'name': args.name, 'python': args.python, 'packages': args.packages}))
        elif args.group == 'scripts':
            if args.action == 'save':
                source = Path(args.file).read_text(encoding='utf-8')
                tags = [t for t in args.tags.split(',') if t.strip()]
                _print(runtime.dispatch({'op': 'script_library', 'action': 'save', 'id': args.id, 'filename': Path(args.file).name, 'source': source, 'description': args.description, 'tags': tags, 'env': args.env, 'expectedRevision': args.expected_revision}))
            elif args.action == 'run':
                session = runtime.start({'goal': 'cli script_run', 'allowEdits': True, 'allowCommands': True})
                payload = {'libraryId': args.id, 'env': args.env, 'input': json.loads(args.input)}
                if args.file:
                    payload = {'source': Path(args.file).read_text(encoding='utf-8'), 'filename': Path(args.file).name, 'env': args.env, 'input': json.loads(args.input)}
                _print(runtime.tool(runtime.get(session['id']), 'script_run', payload, 'cli_run', enforce_plan=False))
            elif args.action == 'import':
                _print(runtime.dispatch({'op': 'script_library', 'action': 'import', 'payload': json.loads(Path(args.file).read_text(encoding='utf-8'))}))
            else:
                _print(runtime.dispatch({'op': 'script_library', 'action': args.action, 'id': args.id, 'query': args.query or ''}))
        elif args.group == 'memory':
            if args.action == 'suite-stats':
                _print(runtime.dispatch({'op': 'memory_suite', 'action': 'stats'}))
            elif args.action == 'research':
                _print(runtime.dispatch({'op': 'memory_suite', 'action': 'gam_research', 'query': args.query or ''}))
            else:
                tags = [t for t in args.tags.split(',') if t.strip()] if args.tags else None
                _print(runtime.dispatch({'op': 'agent_memory', 'action': args.action, 'id': args.id, 'kind': args.kind if args.action != 'list' else None, 'title': args.title, 'content': args.content, 'query': args.query or '', 'tags': tags, 'importance': args.importance, 'pinned': args.pinned}))
    finally:
        runtime.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
