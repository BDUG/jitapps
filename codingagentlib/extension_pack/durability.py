"""Crash-released host session leases and immutable, transactional checkpoints.

This module implements the documented SessionStore contract; it does not drive
an agent or dispatch tools. POSIX advisory locks are released by the kernel when
a worker exits, including SIGKILL. A process must never delete live lock files.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import uuid

from ..python.sqlite_store import SQLiteSessionStore


class CheckpointStore(SQLiteSessionStore):
    def __init__(self, path, *, retention=1000, transition=None):
        if type(retention) is not int or retention < 1:
            raise ValueError('Checkpoint retention must be positive')
        try:
            import fcntl
        except ImportError as error:
            raise RuntimeError('Durable crash recovery requires POSIX file locks') from error
        self._flock = fcntl
        super().__init__(path)
        self.retention, self.transition = retention, transition or (lambda *_: None)
        self.handles = {}
        self.lock_directory = self.path.parent / (self.path.name + '.locks')
        self.lock_directory.mkdir(mode=0o700, exist_ok=True)
        if self.lock_directory.is_symlink():
            raise PermissionError('Lease directory must not be a symlink')
        with self.lock:
            self.db.executescript('''
                CREATE TABLE IF NOT EXISTS extension_lineage(child TEXT PRIMARY KEY, parent TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS checkpoints(
                    checkpoint INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant TEXT NOT NULL, session TEXT NOT NULL,
                    revision INTEGER NOT NULL, body TEXT NOT NULL,
                    UNIQUE(tenant,session,revision));
                CREATE TRIGGER IF NOT EXISTS checkpoints_no_replace
                    BEFORE INSERT ON checkpoints
                    WHEN EXISTS(SELECT 1 FROM checkpoints WHERE checkpoint=NEW.checkpoint)
                    BEGIN SELECT RAISE(ABORT,'Checkpoints are immutable'); END;
                CREATE TRIGGER IF NOT EXISTS checkpoints_no_update
                    BEFORE UPDATE ON checkpoints BEGIN
                    SELECT RAISE(ABORT,'Checkpoints are immutable'); END;
            ''')

    def acquire(self, tenant, identity, owner):
        key = (tenant, identity)
        with self.lock:
            if key in self.handles:
                return False
            digest = hashlib.sha256(json.dumps(key).encode()).hexdigest()
            fd = os.open(self.lock_directory / digest,
                         os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            try:
                self._flock.flock(fd, self._flock.LOCK_EX | self._flock.LOCK_NB)
            except BlockingIOError:
                os.close(fd)
                return False
            try:
                self.db.execute('BEGIN IMMEDIATE')
                # Holding the OS lock proves that any old DB lease is stale.
                self.db.execute('DELETE FROM leases WHERE tenant=? AND id=?', key)
                self.db.execute('INSERT INTO leases VALUES(?,?,?)', (*key, owner))
                self.db.execute('COMMIT')
            except BaseException:
                self.db.execute('ROLLBACK')
                os.close(fd)
                raise
            self.owners[key], self.handles[key] = owner, fd
            return True

    def release(self, tenant, identity, owner):
        key = (tenant, identity)
        with self.lock:
            if self.owners.get(key) != owner:
                return
            super().release(tenant, identity, owner)
            os.close(self.handles.pop(key))

    def save(self, tenant, identity, state, revision):
        with self.lock:
            if (tenant, identity) not in self.owners:
                raise ValueError('Save requires a session lease')
            body = json.dumps({**state, 'revision': revision + 1}, allow_nan=False)
            checkpoint = None
            self.db.execute('BEGIN IMMEDIATE')
            try:
                previous = self.db.execute('SELECT revision FROM sessions WHERE tenant=? AND id=?',
                                           (tenant, identity)).fetchone()
                if (previous[0] if previous else 0) != revision:
                    raise ValueError('Session revision conflict')
                self.db.execute('INSERT OR REPLACE INTO sessions VALUES(?,?,?,?)',
                                (tenant, identity, revision + 1, body))
                if state.get('pending') is None:
                    checkpoint = self.db.execute(
                        'INSERT INTO checkpoints(tenant,session,revision,body) VALUES(?,?,?,?)',
                        (tenant, identity, revision + 1, body)).lastrowid
                    self.db.execute('DELETE FROM checkpoints WHERE tenant=? AND session=? AND checkpoint NOT IN '
                                    '(SELECT checkpoint FROM checkpoints WHERE tenant=? AND session=? '
                                    'ORDER BY checkpoint DESC LIMIT ?)',
                                    (tenant, identity, tenant, identity, self.retention))
                self.db.execute('COMMIT')
            except BaseException:
                self.db.execute('ROLLBACK')
                raise
            if checkpoint is not None:
                self.transition('checkpoint.saved', dict(sessionId=identity, checkpointId=str(checkpoint),
                                                         revision=revision + 1))
            return revision + 1

    def checkpoints(self, tenant, identity):
        with self.lock:
            rows = self.db.execute('SELECT checkpoint,revision,body FROM checkpoints '
                                   'WHERE tenant=? AND session=? ORDER BY checkpoint', (tenant, identity))
            return [dict(checkpointId=str(cid), revision=rev, state=json.loads(body))
                    for cid, rev, body in rows]

    def fork(self, tenant, identity, checkpoint_id):
        """Create a resumable branch without executing or replaying any tools.

        This restores agent state, not arbitrary external side effects. Hosts must
        restore the matching worktree/artifact snapshot before resuming edits.
        """
        with self.lock:
            row = self.db.execute('SELECT body FROM checkpoints WHERE tenant=? AND session=? AND checkpoint=?',
                                  (tenant, identity, checkpoint_id)).fetchone()
            if not row:
                raise ValueError('Checkpoint not found for this tenant/session')
            state = copy.deepcopy(json.loads(row[0]))
            if state.get('pending'):
                raise ValueError('Uncertain tool calls cannot be replayed')
            new_id = uuid.uuid4().hex
            state.update(id=new_id, revision=0, status='paused')
            self.db.execute('INSERT INTO extension_lineage VALUES(?,?)', (new_id, identity))
            owner = uuid.uuid4().hex
            if not self.acquire(tenant, new_id, owner):
                raise ValueError('Fork lease unavailable')
            try:
                self.save(tenant, new_id, state, 0)
            finally:
                self.release(tenant, new_id, owner)
            self.transition('checkpoint.forked', dict(sessionId=new_id, checkpointId=str(checkpoint_id),
                                                       parentSessionId=identity))
            return new_id

    def close(self):
        with self.lock:
            for (tenant, identity), owner in list(self.owners.items()):
                self.release(tenant, identity, owner)
            super().close()
