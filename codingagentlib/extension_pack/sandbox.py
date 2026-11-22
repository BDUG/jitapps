"""One-shot Docker boundary for code actions and browser/test verification.

The host owns Docker authentication, images and transport. This module never
installs a browser or pulls an image implicitly. Artifacts are returned as data;
no source directory is ever mounted writable.
"""
import json
import os
import selectors
import shutil
import warnings
import tempfile
import time
from pathlib import Path
import re
import subprocess
import uuid


class Sandbox:
    def __init__(self, *, image, timeout=30, memory_mb=256, cpus=1, docker='docker', pids_limit=256):
        if not re.fullmatch(r'(?:sha256:[0-9a-f]{64}|[^\s]+@sha256:[0-9a-f]{64})', image):
            raise ValueError('Sandbox image must be pinned by digest or local image id')
        if not 1 <= timeout <= 300 or not 64 <= memory_mb <= 4096 or not 0 < cpus <= 8:
            raise ValueError('Invalid sandbox resource limits')
        if type(pids_limit) is not int or not 16 <= pids_limit <= 512:
            raise ValueError('Invalid sandbox process limit')
        self.pids_limit = pids_limit
        self.image, self.timeout, self.memory_mb, self.cpus, self.docker = image, timeout, memory_mb, cpus, docker

    def run(self, argv, *, repository=None, input_data=None):
        if not isinstance(argv, (list, tuple)) or not argv or any(not isinstance(v, str) or '\0' in v for v in argv):
            raise ValueError('Provide a literal sandbox argv')
        if shutil.which(self.docker) is None:
            warnings.warn('Docker sandbox unavailable; optional action was not executed', RuntimeWarning)
            return dict(ok=False, unavailable=True, exitCode=None, stdout='', stderr='Docker unavailable')
        name = 'tlal-ext-' + uuid.uuid4().hex
        command = [self.docker, 'run', '--pull=never', '--rm', '--name', name, '-i',
                   '--user', '65534:65534', '--network', 'none', '--cap-drop', 'ALL',
                   '--security-opt', 'no-new-privileges', '--read-only', '--pids-limit', str(self.pids_limit),
                   '--memory', f'{self.memory_mb}m', '--memory-swap', f'{self.memory_mb}m',
                   '--cpus', str(self.cpus), '--ulimit', 'fsize=67108864:67108864',
                   '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777', '--workdir', '/tmp']
        if repository is not None:
            root = Path(repository).resolve(strict=True)
            if not root.is_dir() or ',' in str(root):
                raise ValueError('Invalid sandbox input directory')
            command += ['--mount', f'type=bind,src={root},dst=/input,readonly']
        # A second deadline lives INSIDE the container, so a host SIGKILL cannot
        # leave code running indefinitely. The reviewed image provides coreutils.
        command += ['--entrypoint', '/usr/bin/timeout', self.image,
                    '--signal=KILL', str(self.timeout) + 's', *argv]
        payload = json.dumps(input_data).encode()
        if len(payload) > 1_000_000:
            raise ValueError('Sandbox input exceeds 1 MB')
        process = None
        try:
            with tempfile.TemporaryFile() as source:
                source.write(payload); source.seek(0)
                process = subprocess.Popen(command, stdin=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                output = {'stdout': bytearray(), 'stderr': bytearray()}
                deadline = time.monotonic() + self.timeout
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
                    selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
                    while selector.get_map():
                        if time.monotonic() >= deadline:
                            raise subprocess.TimeoutExpired(command, self.timeout)
                        for key, _ in selector.select(.1):
                            chunk = os.read(key.fileobj.fileno(), 65536)
                            if not chunk:
                                selector.unregister(key.fileobj)
                                continue
                            output[key.data].extend(chunk)
                            if sum(len(v) for v in output.values()) > 1_000_000:
                                raise ValueError('Sandbox output exceeds 1 MB')
                status = process.wait(timeout=max(.01, deadline - time.monotonic()))
                if status == 125:
                    warnings.warn('Docker sandbox could not start; verification remains unfulfilled', RuntimeWarning)
                return dict(ok=status == 0, exitCode=status,
                            **{key: value.decode('utf-8', errors='replace') for key, value in output.items()})
        finally:
            if process is not None:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=5)
                process.stdout.close(); process.stderr.close()
            # Also remove containers after timeout/client failure; --rm handles normal exit.
            subprocess.run([self.docker, 'rm', '-f', name], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=10)

    def code_action(self, code, data, *, repository=None):
        if not isinstance(code, str) or len(code) > 100000:
            raise ValueError('Code action must be bounded Python source')
        return self.run(['python3', '-I', '-c', code], repository=repository, input_data=data)
