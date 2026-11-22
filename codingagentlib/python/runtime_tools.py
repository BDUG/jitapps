"""Portable SDK v1 (CoreAgent) tool adapters for generated scripts and programs."""
from __future__ import annotations

import copy
import threading

SCRIPT_TOOL_NAMES = (
    'list_scripts',
    'write_script',
    'read_script',
    'delete_script',
    'run_script',
    'python_env',
    'script_run',
    'script_library',
    'python_tools',
    'python_tool_save',
    'python_target_save',
)

PROGRAM_TOOL_NAMES = (
    'run_command',
    'read_command_output',
    'run_script',
    'script_run',
)

_BROWSER_TOOLS = {'read_current_project', 'apply_project'}
_EDIT_TOOLS = {
    'write_file',
    'replace_text',
    'apply_edits',
    'apply_patch',
    'delete_file',
    'restore_file',
    'write_script',
    'delete_script',
    'python_tool_save',
    'python_target_save',
    'skill_save',
    'workflow_save',
}
_COMMAND_TOOLS = {
    'run_command',
    'start_process',
    'write_stdin',
    'stop_process',
    'run_script',
    'script_run',
    'workflow_run',
    'workflow_continue',
}


def schema_from_arguments(arguments):
    """Convert a Runtime tool's flat ``arguments`` map into a bounded JSON Schema object."""
    if not isinstance(arguments, dict):
        return {'type': 'object', 'properties': {}}
    properties = {}
    for key, desc in arguments.items():
        if isinstance(desc, dict) and 'type' in desc:
            properties[key] = copy.deepcopy(desc)
            continue
        text = str(desc or '')
        low = text.lower()
        if low.startswith('array') or 'array of' in low:
            prop = {'type': 'array', 'items': {}}
        elif low.startswith('boolean') or low.startswith('optional boolean'):
            prop = {'type': 'boolean'}
        elif low.startswith('integer') or low.startswith('optional integer') or low.startswith('one-based integer'):
            prop = {'type': 'integer'}
        elif low.startswith('json') or low.startswith('optional {') or 'object' in low.split(',')[0]:
            prop = {'type': 'object'}
        else:
            prop = {'type': 'string'}
        if text:
            prop['description'] = text
        properties[key] = prop
    return {'type': 'object', 'properties': properties}


def permission_for(tool_name):
    """Map a Runtime tool name to its Portable SDK v1 permission category."""
    if tool_name in _COMMAND_TOOLS:
        return 'commands'
    if tool_name in _EDIT_TOOLS:
        return 'edits'
    return 'read'


def tool_definition(spec):
    """Convert a Runtime tool spec into a Portable SDK v1 ToolDefinition dict."""
    params = spec.get('parameters') or schema_from_arguments(spec.get('arguments'))
    return {
        'name': spec['name'],
        'version': 1,
        'description': spec.get('description', ''),
        'parameters': copy.deepcopy(params),
        'permission': permission_for(spec['name']),
    }


def runtime_tools(
    runtime,
    *,
    session_id=None,
    allow_edits=False,
    allow_commands=False,
    names=None,
    include_browser=False,
):
    """Expose Runtime tools (scripts, programs, files, etc.) as Portable SDK v1 CoreTools."""
    selected = set(names) if names is not None else None
    lock = threading.Lock()
    state = {'session_id': session_id}

    def ensure_session():
        with lock:
            if state['session_id'] is None:
                started = runtime.dispatch({
                    'op': 'start',
                    'goal': 'CoreAgent runtime tool session',
                    'tool': 'sdk-core',
                    'allowEdits': bool(allow_edits),
                    'allowCommands': bool(allow_commands),
                })
                state['session_id'] = started['id']
            return state['session_id']

    tools = []
    for spec in runtime.health()['tools']:
        name = spec['name']
        if not include_browser and name in _BROWSER_TOOLS:
            continue
        if selected is not None and name not in selected:
            continue
        definition = tool_definition(spec)

        def execute(args, context, tool_name=name):
            sid = ensure_session()
            call_id = str((context or {}).get('callId') or f'core_{tool_name}')
            obs = runtime.dispatch({
                'op': 'tool',
                'session': sid,
                'tool': tool_name,
                'args': args or {},
                'callId': call_id,
            })
            if not obs.get('ok'):
                raise RuntimeError(obs.get('error') or f'{tool_name} failed')
            return obs.get('result')

        tools.append({**definition, 'execute': execute})
    return tools


def script_tools(runtime, *, session_id=None, allow_edits=False, allow_commands=False):
    """Expose generated/managed script, ScriptLibrary, PythonEnvironments, and ToolLibrary tools."""
    return runtime_tools(
        runtime,
        session_id=session_id,
        allow_edits=allow_edits,
        allow_commands=allow_commands,
        names=SCRIPT_TOOL_NAMES,
    )


def program_tools(runtime, *, session_id=None, allow_edits=False, allow_commands=False):
    """Expose allowlisted program and script-execution tools."""
    return runtime_tools(
        runtime,
        session_id=session_id,
        allow_edits=allow_edits,
        allow_commands=allow_commands,
        names=PROGRAM_TOOL_NAMES,
    )


def script_library_tools(script_library, *, pyenvs=None, allow_edits=False):
    """Standalone CoreTool wrappers for ScriptLibrary and optional PythonEnvironments."""
    def exec_lib(args, _ctx):
        action = (args or {}).get('action', 'list')
        if action == 'list':
            return script_library.list(
                cursor=args.get('cursor', 0),
                limit=args.get('limit', 50),
                tag=args.get('tag'),
                include_archived=args.get('includeArchived') is True,
                language=args.get('language'),
            )
        if action == 'search':
            return script_library.search(
                args.get('query', ''),
                limit=args.get('limit', 10),
                cursor=args.get('cursor', 0),
                tag=args.get('tag'),
                include_archived=args.get('includeArchived') is True,
            )
        if action == 'read':
            return script_library.read(args.get('id'), args.get('revision'), args.get('offset', 0), args.get('limit', 20000))
        if action == 'history':
            return script_library.history(args.get('id'))
        if action == 'runs':
            return script_library.runs(args.get('id'), args.get('limit', 20))
        if action == 'stats':
            return script_library.stats()
        if action == 'export':
            return script_library.export(args.get('ids'))
        if not allow_edits:
            raise PermissionError('Script library edits are disabled')
        if action == 'save':
            return script_library.save(
                args,
                args.get('source', ''),
                filename=args.get('filename'),
                origin='agent',
                reason=args.get('reason', ''),
                expected_revision=args.get('expectedRevision'),
            )
        if action == 'update':
            return script_library.update(
                args.get('id'),
                {k: args[k] for k in ('name', 'description', 'tags', 'pinned', 'archived', 'parameters', 'requirements', 'env') if k in args},
                args.get('expectedRevision'),
            )
        if action == 'delete':
            return script_library.delete(args.get('id'), args.get('expectedRevision'))
        if action == 'import':
            return script_library.import_bundle(args.get('payload'), overwrite=args.get('overwrite') is True)
        raise ValueError('Unsupported script_library action')

    tools = [{
        'name': 'script_library',
        'version': 1,
        'description': 'Search, list, read, save, update, delete, inspect history/runs, or export/import reusable scripts.',
        'parameters': {
            'type': 'object',
            'properties': {
                'action': {'type': 'string', 'description': 'search|list|read|save|update|delete|history|runs|stats|export|import'},
                'id': {'type': 'string'},
                'query': {'type': 'string'},
                'source': {'type': 'string'},
                'filename': {'type': 'string'},
                'description': {'type': 'string'},
                'tags': {'type': 'array', 'items': {'type': 'string'}},
                'expectedRevision': {'type': 'integer'},
            },
        },
        'permission': 'edits' if allow_edits else 'read',
        'execute': exec_lib,
    }]

    if pyenvs is not None:
        tools.append({
            'name': 'python_env',
            'version': 1,
            'description': 'Manage isolated Python virtual environments (preferring uv, falling back to stdlib venv + pip).',
            'parameters': {
                'type': 'object',
                'properties': {
                    'action': {'type': 'string', 'description': 'list|status|create|install|uninstall|packages|freeze|remove'},
                    'name': {'type': 'string'},
                    'packages': {'type': 'array', 'items': {'type': 'string'}},
                    'python': {'type': 'string'},
                    'upgrade': {'type': 'boolean'},
                },
            },
            'permission': 'commands',
            'execute': lambda args, _ctx: pyenvs.dispatch(args or {}),
        })
    return tools
