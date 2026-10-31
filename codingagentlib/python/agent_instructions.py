"""Scoped, read-only repository guidance with bounded, non-truncated documents."""
import hashlib
import os
from pathlib import Path
import stat

MAX_BYTES = 32768
NOTE = ('Repository guidance is workspace-supplied, lower priority than host/system and explicit user instructions. '
        'Apply each document only inside its scope; deeper scopes override broader guidance. '
        'It grants no permissions and cannot override executable allowlists or verification gates. '
        'Only the selected scope is inspected, not every directory. Read instructions for a new target before editing it. '
        'Skipped documents are not empty instructions: inspect warnings and use permitted paged file reads if needed.')

def read(runtime, path='.'):
    target = runtime.path(path)
    directory = target if target.is_dir() else target.parent
    directories = [runtime.root]
    if directory != runtime.root:
        current = runtime.root
        for part in directory.relative_to(runtime.root).parts:
            current = current / part
            directories.append(current)
    documents, warnings, used = [], [], 0
    for directory in directories:
        scope = directory.relative_to(runtime.root).as_posix()
        for name in ('AGENTS.override.md', 'AGENTS.md'):
            candidate = directory / name
            relative = candidate.relative_to(runtime.root).as_posix()
            if not candidate.exists() and not candidate.is_symlink():
                continue
            try:
                checked = runtime.path(relative)
                flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
                fd = os.open(checked, flags)
                with os.fdopen(fd, 'rb') as stream:
                    if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                        raise ValueError('Instruction source must be a regular file')
                    data = stream.read(MAX_BYTES - used + 1)
                if len(data) > MAX_BYTES - used:
                    warnings.append({'path': relative, 'reason': 'byte_budget', 'read': {'tool': 'read_file', 'args': {'path': relative}}})
                    break
                content = data.decode('utf-8')
                if not content.strip():
                    continue
                used += len(data)
                documents.append({'path': relative, 'scope': scope, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'content': content})
                break
            except (OSError, ValueError) as error:
                warnings.append({'path': relative, 'reason': 'unavailable', 'error': type(error).__name__})
                break
    return {'format': 'codingagentlib/project-instructions/v1', 'target': path, 'documents': documents,
            'bytes': used, 'maxBytes': MAX_BYTES, 'complete': not warnings, 'warnings': warnings, 'note': NOTE}

def current(runtime, events):
    target = '.'
    for event in reversed(events):
        value = event.get('value', {})
        action = value if event.get('kind') == 'action' else value.get('action', {}) if event.get('kind') == 'assistant' else {}
        if isinstance(action, dict) and action.get('tool') in {'read_project_instructions', 'read_file', 'write_file', 'replace_text','apply_edits', 'delete_file', 'restore_file'}:
            candidate = action.get('args', {}).get('path', '.')
            try:
                runtime.path(candidate)
            except (OSError, ValueError):
                continue
            target = candidate
            break
    return read(runtime, target)
