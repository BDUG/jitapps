"""Managed Python virtual environments for agent scripts, backed by uv.

Environments live in the private agent state directory, never inside project
sources. ``uv`` is preferred (``uv venv`` / ``uv pip``); when it is unavailable
the standard-library ``venv`` module and the environment's own ``pip`` are used.

Policy:
- The backend executable (``uv`` or the base interpreter) must be resolvable
  through the host's command policy (allowlist). The environment interpreter is
  then trusted because it was derived from an allowed executable.
- Package specifications are plain PEP 508 requirement names with optional
  extras and version specifiers. URLs, local paths, options (``-e``,
  ``--index-url`` ...) and environment markers are rejected.
- Every process runs through a host-supplied runner so receipts, logs,
  cancellation and timeouts follow the normal command audit trail.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

FORMAT = 'codingagentlib/python-env-v1'
NAME = re.compile(r'[a-z][a-z0-9_-]{0,39}')
PACKAGE = re.compile(
    r'[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?'          # project name
    r'(?:\[[A-Za-z0-9._-]+(?:\s*,\s*[A-Za-z0-9._-]+)*\])?'          # extras
    r'(?:\s*(?:===|==|!=|~=|>=|<=|>|<)\s*[A-Za-z0-9.*+!_-]+'         # first specifier
    r'(?:\s*,\s*(?:===|==|!=|~=|>=|<=|>|<)\s*[A-Za-z0-9.*+!_-]+)*)?'  # more specifiers
)
PYTHON_REQUEST = re.compile(r'(?:3(?:\.\d{1,2}){0,2}|pypy3(?:\.\d{1,2})?|cpython-?3(?:\.\d{1,2}){0,2})')
MAX_PACKAGES = 64
HISTORY = 50


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def normalize(name):
    """PEP 503 normalized project name."""
    return re.sub(r'[-_.]+', '-', name).lower()


def package_name(spec):
    return normalize(re.match(r'[A-Za-z0-9._-]+', spec).group(0))


def validate_packages(packages, *, allow_empty=False):
    if isinstance(packages, str):
        packages = [packages]
    if not isinstance(packages, list) or (not packages and not allow_empty) or len(packages) > MAX_PACKAGES:
        raise ValueError('Provide 1–%d package requirement strings' % MAX_PACKAGES)
    result, seen = [], set()
    for spec in packages:
        if not isinstance(spec, str) or len(spec) > 200:
            raise ValueError('Package requirements must be short strings')
        spec = spec.strip()
        if not PACKAGE.fullmatch(spec):
            raise ValueError('Unsupported package requirement %r. Use name, name[extra] or name with version specifiers; URLs, paths, options and markers are not accepted.' % spec[:80])
        key = package_name(spec)
        if key in seen:
            raise ValueError('Duplicate package requirement: ' + key)
        seen.add(key)
        result.append(spec)
    return result


def validate_name(name):
    name = 'default' if name in (None, '') else name
    if not isinstance(name, str) or not NAME.fullmatch(name):
        raise ValueError('Use a lowercase environment name (letters, digits, - or _; up to 40 characters)')
    return name


def inline_metadata(source):
    """Parse PEP 723 inline script metadata (``# /// script`` block)."""
    if not isinstance(source, str):
        return {}
    match = re.search(r'(?m)^# /// script\s*$\n((?:^#(?: .*)?$\n)+?)^# ///\s*$', source)
    if not match:
        return {}
    body = '\n'.join(line[2:] if line.startswith('# ') else line[1:] for line in match.group(1).splitlines())
    try:
        import tomllib  # Python 3.11+
        data = tomllib.loads(body)
    except ModuleNotFoundError:  # pragma: no cover - Python 3.10 fallback
        data = _mini_toml(body)
    except Exception as error:
        raise ValueError('Invalid PEP 723 script metadata: ' + str(error)) from None
    result = {}
    if isinstance(data.get('dependencies'), list):
        result['dependencies'] = [d for d in data['dependencies'] if isinstance(d, str)]
    if isinstance(data.get('requires-python'), str):
        result['requiresPython'] = data['requires-python']
    return result


def _mini_toml(body):
    """Very small parser for the PEP 723 subset used on Python 3.10."""
    data = {}
    deps = re.search(r'dependencies\s*=\s*\[(.*?)\]', body, re.S)
    if deps:
        data['dependencies'] = re.findall(r'"([^"]+)"|\'([^\']+)\'', deps.group(1))
        data['dependencies'] = [a or b for a, b in data['dependencies']]
    requires = re.search(r'requires-python\s*=\s*["\']([^"\']+)["\']', body)
    if requires:
        data['requires-python'] = requires.group(1)
    return data


def default_runner(argv, *, env=None, cwd=None, timeout=600000, label=None, cancel_event=None):
    """Standalone subprocess runner returning a command-style receipt."""
    started = time.monotonic()
    try:
        completed = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, timeout=timeout / 1000, check=False)
        out, err, code, timed_out = completed.stdout, completed.stderr, completed.returncode, False
    except subprocess.TimeoutExpired as error:
        out, err, code, timed_out = error.stdout or b'', error.stderr or b'', None, True
    except OSError as error:
        return {'command': label or argv[0], 'args': argv[1:], 'exitCode': None, 'started': False,
                'launchError': {'message': str(error)}, 'stdout': '', 'stderr': str(error),
                'timedOut': False, 'cancelled': False, 'durationMs': 0}
    return {'command': label or argv[0], 'args': argv[1:], 'exitCode': code, 'timedOut': timed_out,
            'cancelled': False, 'stdout': out.decode('utf-8', 'replace'), 'stderr': err.decode('utf-8', 'replace'),
            'durationMs': int((time.monotonic() - started) * 1000)}


def default_resolver(name):
    found = shutil.which(name)
    return os.path.abspath(found) if found else None


class PythonEnvironments:
    """Create, populate and inspect named virtual environments.

    ``runner(argv, env=..., cwd=..., timeout=..., label=...)`` executes a process
    and returns a command receipt (``exitCode``, ``stdout``/``stderr`` or log IDs).
    ``resolve(name)`` maps an executable name through the host command policy and
    returns an absolute path or ``None`` when the executable is not permitted.
    """

    def __init__(self, directory, *, runner=None, resolve=None, uv=None, python=None):
        self.root = Path(directory).expanduser().absolute()
        if any(p.is_symlink() for p in [self.root, *self.root.parents] if p.exists()):
            raise ValueError('Python environment directory cannot be a symlink')
        self.runner = runner or default_runner
        self.resolve = resolve or default_resolver
        self.uv_override = uv if uv is not None else os.environ.get('CODINGAGENT_UV') or None
        self.python_override = python

    # ----------------------------------------------------------------- backend
    def uv(self):
        if self.uv_override:
            candidate = Path(self.uv_override).expanduser()
            if candidate.is_file() and os.access(candidate, os.X_OK):
                # An explicit host override is part of host configuration, but
                # it must still pass the command policy by basename.
                if self.resolve('uv') or self.resolve(str(candidate)):
                    return str(candidate.absolute())
                return None
        return self.resolve('uv')

    def base_python(self):
        if self.python_override:
            return self.resolve(self.python_override)
        for name in ('python3', 'python'):
            found = self.resolve(name)
            if found:
                return found
        return None

    def backend(self):
        uv = self.uv()
        if uv:
            return {'name': 'uv', 'executable': uv}
        python = self.base_python()
        if python:
            return {'name': 'venv', 'executable': python}
        return {'name': None, 'executable': None}

    def health(self):
        backend = self.backend()
        return {'format': FORMAT, 'backend': backend['name'], 'executable': backend['executable'],
                'directory': str(self.root), 'preferred': 'uv',
                'available': backend['name'] is not None,
                'note': ('uv is used for environment creation and package management.' if backend['name'] == 'uv' else
                         'uv is unavailable or not allowed; falling back to stdlib venv + pip.' if backend['name'] else
                         'Neither uv nor a Python interpreter is allowed by the command policy. Allow "uv" (preferred) or "python3".')}

    # ------------------------------------------------------------------ layout
    def directory(self, name):
        return self.root / validate_name(name)

    def venv(self, name):
        return self.directory(name) / '.venv'

    def interpreter(self, name):
        venv = self.venv(name)
        return venv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')

    def exists(self, name):
        return self.interpreter(name).exists()

    def metadata_path(self, name):
        return self.directory(name) / 'env.json'

    def metadata(self, name):
        path = self.metadata_path(name)
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return None

    def _write_metadata(self, name, data):
        path = self.metadata_path(name)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
        temporary.replace(path)

    def environment(self, name, base=None):
        """Process environment that activates the virtual environment."""
        venv = self.venv(name)
        env = dict(base if base is not None else os.environ)
        env.pop('PYTHONHOME', None)
        env['VIRTUAL_ENV'] = str(venv)
        env['PATH'] = str(venv / ('Scripts' if os.name == 'nt' else 'bin')) + os.pathsep + env.get('PATH', '')
        env['PYTHONUNBUFFERED'] = '1'
        env.setdefault('PYTHONIOENCODING', 'utf-8')
        return env

    def _python_version(self, name):
        cfg = self.venv(name) / 'pyvenv.cfg'
        try:
            for line in cfg.read_text(encoding='utf-8').splitlines():
                key, _, value = line.partition('=')
                if key.strip() in ('version', 'version_info'):
                    return value.strip()
        except OSError:
            pass
        return None

    def _record(self, name, operation, receipt, **extra):
        data = self.metadata(name) or {'format': FORMAT, 'name': name, 'created': now(), 'declared': {}, 'history': []}
        entry = {'operation': operation, 'at': now(), 'exitCode': receipt.get('exitCode'),
                 'jobId': receipt.get('jobId'), **extra}
        data['history'] = (data.get('history') or [])[-(HISTORY - 1):] + [entry]
        data['updated'] = now()
        data['python'] = self._python_version(name) or data.get('python')
        return data

    @staticmethod
    def ok(receipt):
        return receipt.get('exitCode') == 0 and not receipt.get('timedOut') and not receipt.get('cancelled')

    def _require_backend(self):
        backend = self.backend()
        if not backend['name']:
            raise PermissionError(self.health()['note'])
        return backend

    def _run(self, argv, *, label, timeout, env=None, cancel_event=None):
        kwargs = dict(env=env, timeout=timeout, label=label)
        if cancel_event is not None:
            kwargs['cancel_event'] = cancel_event
        return self.runner(argv, **kwargs)

    # -------------------------------------------------------------- operations
    def list(self):
        items = []
        if self.root.exists():
            for child in sorted(self.root.iterdir()):
                if child.is_dir() and not child.is_symlink() and NAME.fullmatch(child.name):
                    meta = self.metadata(child.name) or {}
                    items.append({'name': child.name, 'exists': self.exists(child.name), 'backend': meta.get('backend'),
                                  'python': meta.get('python'), 'declared': sorted((meta.get('declared') or {}).values()),
                                  'updated': meta.get('updated')})
        return {'environments': items, **self.health()}

    def status(self, name='default'):
        name = validate_name(name)
        meta = self.metadata(name)
        return {'name': name, 'exists': self.exists(name), 'interpreter': str(self.interpreter(name)),
                'python': self._python_version(name), 'declared': sorted(((meta or {}).get('declared') or {}).values()),
                'history': ((meta or {}).get('history') or [])[-10:], 'backend': (meta or {}).get('backend'),
                'lock': (self.directory(name) / 'requirements.lock').exists(), **{'policy': self.health()}}

    def create(self, name='default', *, python=None, timeout=300000, cancel_event=None):
        name = validate_name(name)
        if python is not None and (not isinstance(python, str) or not PYTHON_REQUEST.fullmatch(python)):
            raise ValueError('python must be a version request such as "3.12"')
        if self.exists(name):
            return {'name': name, 'created': False, 'exists': True, 'interpreter': str(self.interpreter(name)),
                    'python': self._python_version(name), 'note': 'Environment already exists; nothing executed.'}
        backend = self._require_backend()
        self.directory(name).mkdir(parents=True, exist_ok=True, mode=0o700)
        if backend['name'] == 'uv':
            argv = [backend['executable'], 'venv', '--no-progress', str(self.venv(name)), *(['--python', python] if python else [])]
        else:
            if python:
                raise ValueError('Selecting a Python version requires uv; allow the "uv" executable')
            argv = [backend['executable'], '-m', 'venv', str(self.venv(name))]
        receipt = self._run(argv, label=backend['name'] + ' venv', timeout=timeout, cancel_event=cancel_event)
        data = self._record(name, 'create', receipt, backend=backend['name'])
        data['backend'] = backend['name']
        self._write_metadata(name, data)
        created = self.ok(receipt) and self.exists(name)
        return {'name': name, 'created': created, 'exists': self.exists(name), 'backend': backend['name'],
                'interpreter': str(self.interpreter(name)), 'python': self._python_version(name), 'receipt': receipt}

    def ensure(self, name='default', **options):
        name = validate_name(name)
        return self.status(name) if self.exists(name) else self.create(name, **options)

    def _pip(self, name, backend, *arguments):
        if backend['name'] == 'uv':
            return [backend['executable'], 'pip', arguments[0], '--no-progress', '--python', str(self.interpreter(name)), *arguments[1:]]
        return [str(self.interpreter(name)), '-m', 'pip', '--disable-pip-version-check', '--no-input', *arguments]

    def install(self, name='default', packages=(), *, upgrade=False, requirements_file=None, timeout=600000, cancel_event=None):
        name = validate_name(name)
        packages = validate_packages(list(packages), allow_empty=requirements_file is not None)
        if not self.exists(name):
            raise ValueError('Environment %r does not exist; create it first' % name)
        backend = self._require_backend()
        extra = (['--upgrade'] if upgrade else []) + (['-r', str(requirements_file)] if requirements_file else [])
        argv = self._pip(name, backend, 'install', *extra, *packages)
        receipt = self._run(argv, label=backend['name'] + ' pip install', timeout=timeout, env=self.environment(name), cancel_event=cancel_event)
        data = self._record(name, 'install', receipt, packages=packages, **({'requirementsFile': str(requirements_file)} if requirements_file else {}))
        if self.ok(receipt):
            declared = data.setdefault('declared', {})
            for spec in packages:
                declared[package_name(spec)] = spec
        self._write_metadata(name, data)
        return {'name': name, 'installed': self.ok(receipt), 'packages': packages, 'receipt': receipt}

    def uninstall(self, name='default', packages=(), *, timeout=300000, cancel_event=None):
        name = validate_name(name)
        packages = validate_packages(list(packages))
        if not self.exists(name):
            raise ValueError('Environment %r does not exist' % name)
        backend = self._require_backend()
        names = [package_name(p) for p in packages]
        argv = self._pip(name, backend, 'uninstall', *([] if backend['name'] == 'uv' else ['-y']), *names)
        receipt = self._run(argv, label=backend['name'] + ' pip uninstall', timeout=timeout, env=self.environment(name), cancel_event=cancel_event)
        data = self._record(name, 'uninstall', receipt, packages=names)
        if self.ok(receipt):
            for key in names:
                (data.get('declared') or {}).pop(key, None)
        self._write_metadata(name, data)
        return {'name': name, 'uninstalled': self.ok(receipt), 'packages': names, 'receipt': receipt}

    def packages(self, name='default', *, timeout=120000, cancel_event=None):
        """Installed distributions as reported by the package manager."""
        name = validate_name(name)
        if not self.exists(name):
            raise ValueError('Environment %r does not exist' % name)
        backend = self._require_backend()
        argv = self._pip(name, backend, 'list', '--format', 'json')
        receipt = self._run(argv, label=backend['name'] + ' pip list', timeout=timeout, env=self.environment(name), cancel_event=cancel_event)
        installed = None
        text = receipt.get('stdout')
        if self.ok(receipt) and isinstance(text, str) and not receipt.get('outputPaged'):
            try:
                installed = [{'name': p['name'], 'version': p['version']} for p in json.loads(text or '[]')]
            except (ValueError, KeyError, TypeError):
                installed = None
        return {'name': name, 'packages': installed, 'receipt': receipt,
                **({} if installed is not None else {'note': 'Read the full stdout log to inspect the package list.'})}

    def freeze(self, name='default', *, timeout=120000, cancel_event=None):
        """Pin exact installed versions into ``requirements.lock`` beside the environment."""
        name = validate_name(name)
        if not self.exists(name):
            raise ValueError('Environment %r does not exist' % name)
        backend = self._require_backend()
        argv = self._pip(name, backend, 'freeze')
        receipt = self._run(argv, label=backend['name'] + ' pip freeze', timeout=timeout, env=self.environment(name), cancel_event=cancel_event)
        lock = None
        text = receipt.get('stdout')
        if self.ok(receipt) and isinstance(text, str) and not receipt.get('outputPaged'):
            lock = self.directory(name) / 'requirements.lock'
            lock.write_text(text, encoding='utf-8')
            data = self._record(name, 'freeze', receipt, lock=str(lock))
            self._write_metadata(name, data)
        return {'name': name, 'lock': str(lock) if lock else None,
                'requirements': [line for line in (text or '').splitlines() if line and not line.startswith('#')] if lock else None,
                'receipt': receipt}

    def missing(self, name, requirements, *, cancel_event=None):
        """Requirements whose project name is not declared/installed in the environment."""
        requirements = validate_packages(list(requirements), allow_empty=True)
        if not requirements:
            return []
        declared = (self.metadata(name) or {}).get('declared') or {}
        return [spec for spec in requirements if declared.get(package_name(spec)) != spec]

    def remove(self, name):
        name = validate_name(name)
        directory = self.directory(name)
        if not directory.exists():
            return {'name': name, 'removed': False}
        if directory.is_symlink() or not directory.resolve().is_relative_to(self.root.resolve()):
            raise PermissionError('Refusing to remove an environment outside the managed directory')
        shutil.rmtree(directory)
        return {'name': name, 'removed': True}

    def dispatch(self, data, *, cancel_event=None):
        action = data.get('action', 'status')
        name = data.get('name', data.get('env', 'default'))
        if action == 'list':
            return self.list()
        if action == 'status':
            return self.status(name)
        if action == 'create':
            return self.create(name, python=data.get('python'), cancel_event=cancel_event)
        if action == 'install':
            return self.install(name, data.get('packages', []), upgrade=data.get('upgrade') is True, cancel_event=cancel_event)
        if action == 'uninstall':
            return self.uninstall(name, data.get('packages', []), cancel_event=cancel_event)
        if action == 'packages':
            return self.packages(name, cancel_event=cancel_event)
        if action == 'freeze':
            return self.freeze(name, cancel_event=cancel_event)
        if action == 'remove':
            return self.remove(name)
        raise ValueError('Unsupported python_env action; use list, status, create, install, uninstall, packages, freeze or remove')


def current_interpreter():
    return sys.executable
