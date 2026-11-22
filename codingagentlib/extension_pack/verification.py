"""Session- and source-bound verification receipts; fail closed on drift."""
import hashlib
import json
from pathlib import Path
import subprocess


def source_digest(repository):
    root = Path(repository).resolve()
    paths = subprocess.run(['git', '-C', str(root), 'ls-files', '-z', '--cached', '--others',
                            '--exclude-standard'], check=True, capture_output=True, timeout=10).stdout
    digest = hashlib.sha256()
    for relative in sorted(set(p for p in paths.split(b'\0') if p)):
        path = root / relative.decode()
        digest.update(relative + b'\0')
        if path.is_symlink():
            digest.update(b'link:' + str(path.readlink()).encode())
        elif path.is_file():
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(65536), b''):
                    digest.update(block)
        else:
            digest.update(b'missing')
        digest.update(b'\0')
    return digest.hexdigest()


class Verification:
    def __init__(self, store, *, required, digest, audit):
        self.store, self.required, self.digest, self.audit = store, required, digest, audit
        if any(layer not in ('deterministic', 'browser', 'security', 'agentic') for layer in required):
            raise ValueError('Unknown verification layer')
        with store.lock:
            store.db.execute('''CREATE TABLE IF NOT EXISTS extension_verification(
                session TEXT, layer TEXT, name TEXT, digest TEXT, passed INTEGER,
                PRIMARY KEY(session,layer,name))''')

    def run(self, session_id, layer, name, runner):
        """runner is an actual host check/tool or Sandbox callback, never model text."""
        if name not in self.required.get(layer, ()) or not callable(runner):
            raise ValueError('Verification check not configured')
        before = self.digest()
        try:
            result = runner()
            passed = isinstance(result, dict) and result.get('ok') is True and self.digest() == before
        except Exception:
            self._record(session_id, layer, name, before, False)
            raise
        self._record(session_id, layer, name, before, passed)
        return passed

    def _record(self, session, layer, name, digest, passed):
        with self.store.lock:
            self.store.db.execute('INSERT OR REPLACE INTO extension_verification VALUES(?,?,?,?,?)',
                                  (session, layer, name, digest, int(passed)))
        self.audit('verification.result', dict(sessionId=session, layer=layer, name=name,
                                                inputDigest=digest, passed=passed))

    def missing(self, session):
        current = self.digest()
        with self.store.lock:
            green = {(layer, name) for layer, name, digest, passed in self.store.db.execute(
                'SELECT layer,name,digest,passed FROM extension_verification WHERE session=?', (session,))
                if passed and digest == current}
        return [f'{layer}:{name}' for layer, names in self.required.items() for name in names
                if (layer, name) not in green]

    def ready(self, session):
        return not self.missing(session)
