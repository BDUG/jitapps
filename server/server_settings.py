"""Private server settings with expiring, revision-bound approval reviews."""
import copy
import json
import os
from pathlib import Path
import secrets
import tempfile
import threading
import time
import shutil
from server.relay import validate_origin
from server import workflow_commands, agent_runtime

LIVE = {'allow_origin', 'agent_no_commands', 'agent_allow_command', 'allow_workflow_command', 'workflow_cwd'}
BOOL = {'disable_agent', 'agent_no_commands', 'skills_offline'}
LIST = {'allow_origin', 'agent_allow_command', 'allow_workflow_command'}
FIELDS = {'bind','port','config','search_config','skills_db','skills_offline','workflow_cwd','agent_workspace','disable_agent','agent_no_commands','agent_navigation_dir','agent_embedding_dir'} | LIST

def read(path):
    p = Path(path).expanduser()
    if not p.exists(): return {}
    data = json.loads(p.read_text())
    if not isinstance(data, dict) or set(data) - FIELDS: raise ValueError('Invalid server configuration fields')
    return data

def normalize(data):
    if not isinstance(data,dict) or set(data) != FIELDS: raise ValueError('Expected complete server settings')
    out = copy.deepcopy(data)
    for key,value in out.items():
        if key in BOOL:
            if type(value) is not bool: raise ValueError(key + ' must be a boolean')
        elif key in LIST:
            if key == 'agent_allow_command' and value is None: continue
            if not isinstance(value,list) or any(not isinstance(v,str) or not v.strip() or '\0' in v for v in value): raise ValueError(key + ' must be a list of nonempty strings')
        elif key == 'port':
            if type(value) is not int or not 0 <= value <= 65535: raise ValueError('Port must be 0–65535')
        elif value is not None and (not isinstance(value,str) or not value.strip() or '\0' in value): raise ValueError('Invalid ' + key)
    for key in ('bind','config','search_config','workflow_cwd','agent_workspace'):
        if not out[key]: raise ValueError(key + ' is required')
    out['allow_origin'] = sorted({validate_origin(v) for v in out['allow_origin']})
    for key in ('workflow_cwd','agent_workspace','agent_navigation_dir','agent_embedding_dir'):
        if key.startswith('agent_') and out['disable_agent']: continue
        if out[key] and not Path(out[key]).expanduser().is_dir(): raise ValueError(key + ' must be an existing directory')
    for key in ('allow_workflow_command','agent_allow_command'):
        for command in out[key] or []:
            if key=='agent_allow_command' and command=='*':continue
            if not shutil.which(command): raise ValueError('Executable not found: ' + command)
    return out

class Settings:
    def __init__(self, server, path, args, default_commands):
        self.server, self.path = server, Path(path).expanduser().resolve()
        self.lock = threading.RLock()
        self.active_requests = 0
        self.revision = 1
        self.reviews = {}
        self.effective = {key:copy.deepcopy(getattr(args,key)) for key in FIELDS}
        self.saved = copy.deepcopy(self.effective)
        self.default_commands = default_commands

    def snapshot(self):
        return {'revision':self.revision,'effective':copy.deepcopy(self.effective),'settings':copy.deepcopy(self.saved),
                'liveFields':sorted(LIVE),'file':str(self.path),'listeningPort':self.server.server_port,
                'restartRequired':[k for k in FIELDS if self.saved[k] != self.effective[k]]}

    def dispatch(self, data):
        with self.lock:
            if not isinstance(data,dict): raise ValueError('Expected settings object')
            if data.get('action') == 'read': return self.snapshot()
            if data.get('revision') != self.revision: raise ValueError('Settings changed. Reload and review again.')
            if data.get('action') == 'review':
                proposal = normalize(data.get('settings'))
                changes = [{'field':k,'before':self.saved[k],'after':proposal[k], 'mode':'live' if k in LIVE else 'restart'} for k in sorted(FIELDS) if proposal[k] != self.saved[k]]
                ticket = secrets.token_urlsafe(32)
                self.reviews = {ticket:(time.monotonic()+300,self.revision,proposal)}
                return {'ticket':ticket,'revision':self.revision,'changes':changes}
            if data.get('action') != 'apply' or data.get('approved') is not True: raise ValueError('Explicit approval of a reviewed change is required')
            review = self.reviews.get(data.get('ticket',''))
            if not review or review[0] < time.monotonic() or review[1] != self.revision: raise ValueError('Review expired. Review your changes again.')
            proposal = review[2]
            changed = {k for k in LIVE if proposal[k] != self.effective[k]}
            runtime = self.server.agent_runtime
            if changed and (self.active_requests or any(s.get('status') == 'running' or s.get('_running') for s in runtime.sessions.values()) or self.server.workflow_commands.active):
                raise ValueError('Agent or workflow work is active. Pause or finish it before applying live changes.')
            runner = workflow_commands.Commands(proposal['allow_workflow_command'], proposal['workflow_cwd']) if changed & {'allow_workflow_command','workflow_cwd'} else None
            allowed = {}
            if changed & {'agent_no_commands','agent_allow_command'} and runtime.root and not proposal['agent_no_commands']:
                commands = proposal['agent_allow_command'] if proposal['agent_allow_command'] is not None else self.default_commands
                allowed = agent_runtime.command_allowlist(commands)
            self.path.parent.mkdir(parents=True,exist_ok=True)
            fd,name = tempfile.mkstemp(prefix='.server-settings-',dir=self.path.parent)
            try:
                with os.fdopen(fd,'w') as stream:
                    json.dump(proposal,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
                os.replace(name,self.path)
            finally:
                if os.path.exists(name): os.unlink(name)
            if runner: self.server.workflow_commands = runner
            if changed & {'agent_no_commands','agent_allow_command'}: runtime.allowed = allowed
            if 'allow_origin' in changed: self.server.allowed_origins = set(proposal['allow_origin'])
            for key in LIVE: self.effective[key] = copy.deepcopy(proposal[key])
            self.saved = copy.deepcopy(proposal)
            self.revision += 1
            self.reviews.clear()
            return self.snapshot()
