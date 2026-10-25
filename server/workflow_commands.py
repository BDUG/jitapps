"""Explicitly enabled, local-origin workflow commands; never invoke a shell."""
import os
import re
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path

class Commands:
    def __init__(self, allowed=(), cwd=None):
        self.allowed = {}
        for name in allowed:
            executable = shutil.which(name)
            if not executable:
                raise ValueError('Workflow executable not found: '+name)
            executable = str(Path(executable).resolve())
            for alias in {name, Path(name).name, executable}:
                self.allowed[alias] = executable
        self.cwd = str(Path(cwd or '.').resolve())
        if not Path(self.cwd).is_dir():
            raise ValueError('Workflow working directory does not exist.')
        self.lock = threading.Lock()
        self.active = {}
        self.cancelled = set()
        self.seen = set()
        self.slots = threading.BoundedSemaphore(2)

    @staticmethod
    def job_id(value):
        if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{8,100}', value):
            raise ValueError('Use a unique command job ID.')
        return value

    def cancel(self, value):
        job = self.job_id(value)
        with self.lock:
            event = self.active.get(job)
            if event:
                event.set()
            else:
                if len(self.cancelled) >= 256:
                    self.cancelled.clear()
                self.cancelled.add(job)
        return {'cancelRequested': True}

    def run(self, data):
        if not self.allowed:
            raise PermissionError('Command execution is disabled. Restart with --allow-workflow-command EXECUTABLE for each trusted program.')
        if not isinstance(data, dict):
            raise ValueError('Expected a command request object.')
        job = self.job_id(data.get('id'))
        command, args, stdin, timeout = (data.get(k) for k in ('command','args','stdin','timeout'))
        if not isinstance(command, str) or command not in self.allowed:
            raise PermissionError('This executable is not on the server workflow allowlist.')
        if not isinstance(args,list) or len(args)>100 or any(not isinstance(a,str) or '\0' in a or len(a)>20000 for a in args):
            raise ValueError('Use up to 100 text arguments without NUL characters.')
        if sum(len(a.encode('utf-8')) for a in args)>64000 or not isinstance(stdin,str) or len(stdin.encode('utf-8'))>64000:
            raise ValueError('Arguments and standard input must each fit within 64 KB.')
        if isinstance(timeout,bool) or not isinstance(timeout,(float,int)) or not 100<=timeout<=30000:
            raise ValueError('Command timeout must be 100–30,000 ms.')
        if not self.slots.acquire(blocking=False):
            raise ValueError('Command runner is busy; try again after active jobs finish.')
        event = threading.Event()
        registered = False
        try:
            with self.lock:
                if job in self.seen or job in self.active:
                    raise ValueError('Command job ID has already been used.')
                if len(self.seen)>4096:
                    self.seen.clear()
                self.seen.add(job)
                self.active[job] = event
                registered = True
                if job in self.cancelled:
                    event.set()
                    self.cancelled.discard(job)
            if event.is_set():
                return {'stdout':'','stderr':'','exitCode':-1,'cancelled':True,'timedOut':False,'truncated':False}
            proc = subprocess.Popen([self.allowed[command], *args], cwd=self.cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, start_new_session=os.name!='nt')
            def kill():
                try:
                    if os.name!='nt':
                        os.killpg(proc.pid, signal.SIGKILL)
                    else:
                        proc.kill()
                except ProcessLookupError:
                    pass
            streams = [bytearray(),bytearray()]
            overflow = threading.Event()
            def read(index, stream):
                try:
                    while True:
                        chunk = stream.read(4096)
                        if not chunk:
                            break
                        room = 64000-len(streams[index])
                        streams[index].extend(chunk[:max(0,room)])
                        if len(chunk)>room:
                            overflow.set();kill();break
                finally:
                    stream.close()
            def feed():
                try:
                    proc.stdin.write(stdin.encode('utf-8'));proc.stdin.flush()
                except (BrokenPipeError,OSError):
                    pass
                finally:
                    try:
                        proc.stdin.close()
                    except (BrokenPipeError,OSError):
                        pass
            readers = [threading.Thread(target=read,args=(i,stream),daemon=True) for i,stream in enumerate((proc.stdout,proc.stderr))]
            for thread in readers:
                thread.start()
            writer = threading.Thread(target=feed,daemon=True);writer.start()
            deadline = time.monotonic()+timeout/1000
            timed_out = False
            while proc.poll() is None:
                if event.is_set() or overflow.is_set() or time.monotonic()>=deadline:
                    timed_out = time.monotonic()>=deadline and not event.is_set() and not overflow.is_set()
                    kill();break
                event.wait(.025)
            proc.wait(timeout=5)
            # Close inherited pipes from any remaining children of this command.
            if os.name!='nt':
                kill()
            for thread in readers:
                thread.join(timeout=2)
            return {'stdout':streams[0].decode('utf-8','replace'),'stderr':streams[1].decode('utf-8','replace'),'exitCode':proc.returncode,'cancelled':event.is_set(),'timedOut':timed_out,'truncated':overflow.is_set()}
        finally:
            if registered:
                with self.lock:
                    self.active.pop(job,None)
            self.slots.release()
