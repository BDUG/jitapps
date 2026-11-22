"""Append-only policy audit and OpenTelemetry Logs export, with recursive redaction."""
import hashlib
import json
import re
import queue
import warnings
import sqlite3
import threading
import time

SECRET_KEY = re.compile(r'(authorization|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)', re.I)
SECRET_VALUE = re.compile(r'(?i)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*[\"\']?[^\s\"\',;]+|(bearer\s+)[^\s\"\']+|\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,})\b')


def redact(value, secrets=()):
    if isinstance(value, dict):
        return {key: '[REDACTED]' if SECRET_KEY.search(str(key)) else redact(item, secrets)
                for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(item, secrets) for item in value]
    if isinstance(value, str):
        value = SECRET_VALUE.sub('[REDACTED]', value)
        for secret in secrets:
            if secret:
                value = value.replace(secret, '[REDACTED]')
    return value


class Audit:
    def __init__(self, store, *, extension_id='tlal.extension-pack', secrets=(), exporter=None):
        self.store, self.extension_id = store, extension_id
        self.secrets, self.exporter = tuple(secrets), exporter
        self.queue = queue.Queue(maxsize=1024) if exporter else None
        self.worker = None
        self.closed = threading.Event()
        if exporter:
            self.worker = threading.Thread(target=self._export_worker, daemon=True, name='extension-otel')
            self.worker.start()
        with store.lock:
            store.db.executescript('''
                CREATE TABLE IF NOT EXISTS extension_audit(
                    sequence INTEGER PRIMARY KEY, body TEXT NOT NULL, previous TEXT NOT NULL,
                    digest TEXT NOT NULL);
                CREATE TRIGGER IF NOT EXISTS audit_no_replace BEFORE INSERT ON extension_audit
                    WHEN EXISTS(SELECT 1 FROM extension_audit WHERE sequence=NEW.sequence)
                    BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
                CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON extension_audit
                    BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
                CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON extension_audit
                    BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
            ''')

    def emit(self, name, value):
        with self.store.lock:
            row = self.store.db.execute('SELECT checkpoint FROM checkpoints WHERE session=? ORDER BY checkpoint DESC LIMIT 1',
                                        (value.get('sessionId', 'unbound'),)).fetchone()
        checkpoint = str(row[0]) if row else 'none'
        attributes = redact(dict(extensionId=self.extension_id,
                                 sessionId=value.get('sessionId', 'unbound'),
                                 checkpointId=value.get('checkpointId', checkpoint), **{
                                     k: v for k, v in value.items()
                                     if k not in ('extensionId', 'sessionId', 'checkpointId')}), self.secrets)
        record = dict(timeUnixNano=str(time.time_ns()), severityText='INFO',
                      body={'stringValue': name}, attributes=[
                          {'key': key, 'value': {'stringValue': json.dumps(item) if not isinstance(item, str) else item}}
                          for key, item in attributes.items()])
        body = json.dumps(record, sort_keys=True, separators=(',', ':'))
        with self.store.lock:
            self.store.db.execute('BEGIN IMMEDIATE')
            try:
                row = self.store.db.execute('SELECT sequence,digest FROM extension_audit ORDER BY sequence DESC LIMIT 1').fetchone()
                sequence, previous = (row[0] + 1, row[1]) if row else (1, '0' * 64)
                digest = hashlib.sha256((previous + body).encode()).hexdigest()
                self.store.db.execute('INSERT INTO extension_audit VALUES(?,?,?,?)',
                                      (sequence, body, previous, digest))
                self.store.db.execute('COMMIT')
            except BaseException:
                self.store.db.execute('ROLLBACK')
                raise
        if self.queue is not None:
            try:
                self.queue.put_nowait(record)
            except queue.Full:
                warnings.warn('OTel exporter is behind; records remain in the durable audit', RuntimeWarning)
        return record

    def _export_worker(self):
        while True:
            try:
                record = self.queue.get(timeout=.1)
            except queue.Empty:
                if self.closed.is_set():
                    return
                continue
            try:
                self.exporter(record)
            except Exception as error:
                warnings.warn('OTel export failed; record retained in local audit: ' + type(error).__name__, RuntimeWarning)
            finally:
                self.queue.task_done()

    def close(self):
        if self.queue is not None:
            self.closed.set()
            self.worker.join(timeout=5)
            if self.worker.is_alive():
                warnings.warn('OTel exporter still draining; durable log remains available', RuntimeWarning)

    def export(self):
        with self.store.lock:
            records = [json.loads(row[0]) for row in self.store.db.execute(
                'SELECT body FROM extension_audit ORDER BY sequence')]
        return dict(resourceLogs=[dict(resource={'attributes': [
            {'key': 'service.name', 'value': {'stringValue': self.extension_id}}]},
            scopeLogs=[dict(scope={'name': self.extension_id}, logRecords=records)])])

    def verify(self):
        previous, expected_sequence = '0' * 64, 1
        with self.store.lock:
            for sequence, body, parent, digest in self.store.db.execute('SELECT * FROM extension_audit ORDER BY sequence'):
                if sequence != expected_sequence or parent != previous or digest != hashlib.sha256((previous + body).encode()).hexdigest():
                    return False
                previous = digest
                expected_sequence += 1
        return True
