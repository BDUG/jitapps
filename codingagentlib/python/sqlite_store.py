"""Optional private SQLite session store with transactional revisions and leases."""
import json
import os
from pathlib import Path
import sqlite3
import stat
import threading


class SQLiteSessionStore:
    def __init__(self, path):
        self.path = Path(path).absolute()
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.path.parent.is_symlink() or os.name != 'nt' and self.path.parent.stat().st_mode & 0o077:
            raise PermissionError('Session directory must be private (0700)')
        descriptor = os.open(self.path, os.O_CREAT | os.O_RDWR | getattr(os,'O_NOFOLLOW',0), 0o600)
        try:
            mode = os.fstat(descriptor).st_mode
            if not stat.S_ISREG(mode) or os.name != 'nt' and mode & 0o077:
                raise PermissionError('Session file must be private (0600)')
        finally:
            os.close(descriptor)
        self.db = sqlite3.connect(self.path, isolation_level=None, check_same_thread=False)
        self.lock, self.owners = threading.RLock(), {}
        with self.lock:
            self.db.executescript('CREATE TABLE IF NOT EXISTS sessions(tenant TEXT, id TEXT, revision INTEGER, body TEXT, PRIMARY KEY(tenant,id)); CREATE TABLE IF NOT EXISTS leases(tenant TEXT, id TEXT, owner TEXT, PRIMARY KEY(tenant,id));')

    def close(self):
        with self.lock:
            self.db.close()

    def acquire(self, tenant, identity, owner):
        with self.lock:
            try:
                self.db.execute('INSERT INTO leases VALUES(?,?,?)',(tenant,identity,owner))
                self.owners[(tenant,identity)] = owner
                return True
            except sqlite3.IntegrityError:
                return False

    def release(self, tenant, identity, owner):
        with self.lock:
            if self.owners.get((tenant,identity)) == owner:
                self.db.execute('DELETE FROM leases WHERE tenant=? AND id=? AND owner=?',(tenant,identity,owner))
                del self.owners[(tenant,identity)]

    def load(self, tenant, identity):
        with self.lock:
            row = self.db.execute('SELECT body FROM sessions WHERE tenant=? AND id=?',(tenant,identity)).fetchone()
            return json.loads(row[0]) if row else None

    def save(self, tenant, identity, state, revision):
        with self.lock:
            if (tenant,identity) not in self.owners:
                raise ValueError('Save requires a session lease')
            self.db.execute('BEGIN IMMEDIATE')
            try:
                row = self.db.execute('SELECT revision FROM sessions WHERE tenant=? AND id=?',(tenant,identity)).fetchone()
                if (row[0] if row else 0) != revision:
                    raise ValueError('Session revision conflict')
                self.db.execute('INSERT OR REPLACE INTO sessions VALUES(?,?,?,?)',(tenant,identity,revision+1,json.dumps({**state,'revision':revision+1},allow_nan=False)))
                self.db.execute('COMMIT')
                return revision+1
            except BaseException:
                self.db.execute('ROLLBACK')
                raise
