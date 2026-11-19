"""Revisioned project trees. HEAD is the atomic commit point; old revisions are retained."""
import base64
import binascii
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import threading
import uuid
from contextlib import contextmanager

APPS = {'schematiX', 'mergiX', 'rstiX'}

class Conflict(ValueError):
    pass


def relative(value):
    if (not isinstance(value, str) or not value or len(value) > 512 or
            any(ord(c) < 32 for c in value) or '\\' in value or ':' in value or
            value.startswith('/') or any(p in {'', '.', '..'} for p in value.split('/'))):
        raise ValueError('Use a project-relative file or folder path')
    return value


def atomic(path, value):
    temporary = path.with_name('.' + path.name + '-' + uuid.uuid4().hex)
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class Projects:
    def __init__(self, root):
        raw = Path(root).expanduser().absolute()
        if any(p.is_symlink() for p in [raw, *raw.parents]):
            raise ValueError('Project storage cannot use symlinks')
        self.root = raw.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = threading.RLock()

    def safe(self, path):
        if not path.is_relative_to(self.root) or any(p.is_symlink() for p in [path, *path.parents] if p.is_relative_to(self.root)):
            raise ValueError('Symlinks are not supported in project storage')
        return path

    def directory(self, ident):
        if not isinstance(ident, str) or not re.fullmatch('[a-f0-9]{32}', ident):
            raise ValueError('Invalid project ID')
        return self.safe(self.root / ident)

    def head(self, ident, app):
        directory = self.directory(ident)
        value = json.loads(self.safe(directory / 'HEAD.json').read_text(encoding='utf-8'))
        if not isinstance(value,dict):raise ValueError('Invalid project metadata')
        if value.get('app') != app:
            raise ValueError('Project belongs to a different app')
        if type(value.get('revision')) is not int or value['revision'] < 1:
            raise ValueError('Invalid project revision')
        return directory, value

    def load(self, ident, app):
        directory, head = self.head(ident, app)
        revision = self.safe(directory / 'revisions' / str(head['revision']))
        value = json.loads(self.safe(revision / 'project.json').read_text(encoding='utf-8'))
        # Read real filesystem bytes, not only the editor snapshot.
        files, folders, size = [], [], 0
        root = self.safe(revision / 'files')
        for path in sorted(root.rglob('*')):
            self.safe(path)
            name = relative(path.relative_to(root).as_posix())
            if path.is_dir(): folders.append(name)
            elif path.is_file():
                size+=path.stat().st_size
                if len(files)>=2000 or size>48*1024*1024:raise ValueError('Project tree exceeds supported import bounds')
                if path.stat().st_size > 16 * 1024 * 1024:
                    raise ValueError('Project file exceeds 16 MiB')
                files.append({'path': name, 'encoding': 'base64', 'content': base64.b64encode(path.read_bytes()).decode('ascii')})
        return {**head, 'id': ident, 'state': value['state'], 'files': files, 'folders': folders,
                'root': str(directory), 'filesRoot': str(root)}

    def save(self, data):
        app, name, state = data['app'], data.get('name'), data.get('state')
        if not isinstance(name, str) or not name.strip() or len(name) > 200:
            raise ValueError('Project name must have 1–200 characters')
        if not isinstance(state, dict): raise ValueError('Editor state must be an object')
        # Reject non-finite JSON before creating a revision.
        json.dumps(state, allow_nan=False)
        files, folders = data.get('files', []), data.get('folders', [])
        if not isinstance(files, list) or len(files) > 2000 or not isinstance(folders, list) or len(folders) > 2000:
            raise ValueError('A project supports up to 2,000 files and folders')
        decoded, directories, seen, size = [], set(), set(), 0
        for folder in folders:
            directories.add(relative(folder))
        for file in files:
            if not isinstance(file, dict): raise ValueError('Invalid file')
            path = relative(file.get('path'))
            if path in seen: raise ValueError('Duplicate file path: ' + path)
            seen.add(path)
            content = file.get('content')
            if not isinstance(content, str): raise ValueError('File content must be text or base64')
            try:
                if file.get('encoding', 'utf8') == 'utf8': raw = content.encode('utf-8')
                elif file.get('encoding') == 'base64': raw = base64.b64decode(content, validate=True)
                else: raise ValueError('Unknown file encoding')
            except (binascii.Error, UnicodeError): raise ValueError('Invalid file encoding') from None
            size += len(raw)
            if len(raw) > 16 * 1024 * 1024 or size > 48 * 1024 * 1024:
                raise ValueError('Project exceeds 16 MiB per file or 48 MiB total')
            decoded.append((path, raw))
        all_paths = seen | directories
        for path in all_paths:
            for parent in PurePosixPath(path).parents:
                if str(parent) in seen: raise ValueError('A file cannot also be a parent folder')
        if seen & directories: raise ValueError('A file cannot also be a folder')
        ident = data.get('id')
        if ident:
            directory, head = self.head(ident, app)
            if type(data.get('expectedRevision')) is not int or data['expectedRevision'] != head['revision']:
                raise Conflict('Project changed on the server. Save a copy or reopen it before saving.')
            revision = head['revision'] + 1
        else:
            ident, revision = uuid.uuid4().hex, 1
            directory = self.directory(ident)
            directory.mkdir(mode=0o700)
        revisions = self.safe(directory / 'revisions')
        revisions.mkdir(exist_ok=True)
        staged = revisions / ('.pending-' + uuid.uuid4().hex)
        staged.mkdir(mode=0o700)
        try:
            root = staged / 'files'
            root.mkdir()
            for folder in sorted(directories): (root / folder).mkdir(parents=True, exist_ok=True)
            for path, raw in decoded:
                destination = root / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open('xb') as stream:
                    stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            atomic(staged / 'project.json', {'state': state})
            destination = self.safe(revisions / str(revision))
            # A crash may leave an unreferenced revision. Keep it for recovery.
            if destination.exists(): destination.rename(revisions / ('orphan-' + uuid.uuid4().hex))
            staged.rename(destination)
            head = {'app': app, 'name': name.strip(), 'revision': revision}
            atomic(directory / 'HEAD.json', head)
        finally:
            if staged.exists(): shutil.rmtree(staged)
        return {**head, 'id': ident, 'root': str(directory), 'filesRoot': str(destination / 'files')}

    @contextmanager
    def exclusive(self):
        # Serialize revisions across multiple server processes as well as threads.
        with self.lock:
            descriptor=os.open(self.safe(self.root/'.lock'),os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
            try:
                if os.name=='nt':
                    import msvcrt
                    os.write(descriptor,b'0');os.lseek(descriptor,0,os.SEEK_SET)
                    msvcrt.locking(descriptor,msvcrt.LK_LOCK,1)
                else:
                    import fcntl
                    fcntl.flock(descriptor,fcntl.LOCK_EX)
                yield
            finally:
                os.close(descriptor)

    def dispatch(self, data):
        if not isinstance(data, dict) or data.get('app') not in APPS:
            raise ValueError('Select schematiX, mergiX or rstiX')
        with self.exclusive():
            action, app = data.get('action'), data['app']
            if action == 'list':
                projects = []
                for directory in sorted(self.root.iterdir()):
                    if re.fullmatch('[a-f0-9]{32}', directory.name):
                        try:
                            _, head = self.head(directory.name, app)
                            projects.append({**head, 'id': directory.name})
                        except (ValueError, OSError): continue
                return {'projects': projects}
            if action == 'open': return self.load(data.get('id'), app)
            if action == 'save': return self.save(data)
            raise ValueError('Unknown project operation')
