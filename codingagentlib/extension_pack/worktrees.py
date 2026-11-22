"""Owned git worktrees with per-task OS leases and crash-recovery cleanup."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import uuid


class Worktrees:
    def __init__(self, repository, directory, *, mode='isolated_per_task', audit=None):
        if mode not in ('isolated_per_task', 'shared_workspace'):
            raise ValueError('Unknown worktree policy')
        import fcntl
        self.fcntl, self.repository = fcntl, Path(repository).resolve()
        self.directory, self.mode = Path(directory).absolute(), mode
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.directory.is_symlink() or self.directory.stat().st_mode & 0o077:
            raise PermissionError('Worktree registry must be private')
        self.audit, self.leases = audit or (lambda *_: None), {}
        self._git('rev-parse', '--show-toplevel')

    def _git(self, *args):
        return subprocess.run(['git', '-C', str(self.repository), *args], check=True,
                              text=True, capture_output=True, timeout=60).stdout.strip()

    def _paths(self, task):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', task):
            raise ValueError('Invalid task id')
        return self.directory / task, self.directory / (task + '.json'), self.directory / (task + '.lock')

    def create(self, task, *, base='HEAD'):
        if self.mode == 'shared_workspace':
            self.audit('worktree.shared', dict(sessionId=task, path=str(self.repository)))
            return self.repository
        path, record, lease = self._paths(task)
        fd = os.open(lease, os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            self.fcntl.flock(fd, self.fcntl.LOCK_EX | self.fcntl.LOCK_NB)
            if record.exists() or path.exists():
                raise ValueError('Task already exists; recover or finish it first')
            # Resolve base to a commit; never pass a model-controlled git option.
            commit = self._git('rev-parse', '--verify', '--end-of-options', base + '^{commit}')
            branch = 'ext/' + task + '-' + uuid.uuid4().hex[:12]
            record.write_text(json.dumps(dict(path=str(path), branch=branch,
                                             repository=str(self.repository), state='creating')))
            self._git('worktree', 'add', '-b', branch, str(path), commit)
            record.write_text(json.dumps(dict(path=str(path), branch=branch,
                                             repository=str(self.repository), state='active')))
            self.leases[task] = fd
            self.audit('worktree.created', dict(sessionId=task, path=str(path), branch=branch))
            return path
        except BaseException:
            os.close(fd)
            raise

    def finish(self, task, *, outcome='abort'):
        if self.mode == 'shared_workspace':
            return
        if outcome not in ('abort', 'merged', 'crash'):
            raise ValueError('Unknown cleanup outcome')
        path, record, lease = self._paths(task)
        fd = self.leases.get(task)
        owned = fd is not None
        if not owned:
            fd = os.open(lease, os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            try:
                self.fcntl.flock(fd, self.fcntl.LOCK_EX | self.fcntl.LOCK_NB)
            except BlockingIOError:
                os.close(fd)
                return False  # Live process still owns this task.
        try:
            if not record.exists():
                return True
            data = json.loads(record.read_text())
            if data['path'] != str(path) or data['repository'] != str(self.repository) or not re.fullmatch(r'ext/[A-Za-z0-9_-]+-[0-9a-f]{12}', data['branch']):
                raise ValueError('Invalid owned-worktree record')
            if path.exists():
                self._git('worktree', 'remove', '--force', str(path))
            branches = self._git('for-each-ref', '--format=%(refname:short)', 'refs/heads/' + data['branch']).splitlines()
            if data['branch'] in branches:
                self._git('branch', '-D', data['branch'])
            record.unlink()
            self._git('worktree', 'prune')
            self.audit('worktree.cleaned', dict(sessionId=task, outcome=outcome))
            return True
        finally:
            if owned:
                self.leases.pop(task)
            os.close(fd)

    def recover(self):
        return [record.stem for record in self.directory.glob('*.json')
                if self.finish(record.stem, outcome='crash')]

    def close(self):
        for task in list(self.leases):
            self.finish(task, outcome='abort')
