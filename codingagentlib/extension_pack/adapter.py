"""Composable host configuration adapter. No private host APIs or execution loop."""
import copy
import json
from pathlib import Path
import warnings
import subprocess

from .audit import Audit, redact
from .conventions import Conventions
from .durability import CheckpointStore
from .gateway import Gateway
from .routing import Routing
from .verification import Verification, source_digest

HERE = Path(__file__).resolve().parent


class ExtensionPack:
    id = 'tlal.extension-pack'
    version = '1.2.0'
    compatibleHostSdkRange = '>=0.1.0 <0.2.0'
    hostProtocol = 'codingagentlib/sdk-v1'

    def __init__(self, repository, state_directory, *, enabled=True, enabled_agents=None,
                 verification=None, rules=None, interactive=False, headless_policy='deny',
                 approve=None, secrets=(), retry_threshold=3, retention=1000,
                 context_window=32000, disabled_skills=(), digest=None, exporter=None,
                 ui_mode='auto', ui_sink=None, mcp_servers=None, a2a_bridge=None,
                 worktrees=None, sandbox=None):
        self.enabled = enabled
        if not enabled:
            return
        if ui_mode not in ('auto', 'enabled', 'disabled'):
            raise ValueError('Invalid UI protocol mode')
        self.enabled, self.repository = enabled, Path(repository).resolve()
        self.interactive, self.ui_mode, self.ui_sink = interactive, ui_mode, ui_sink
        self._ui_sessions = set()
        self.enabled_agents = set(enabled_agents if enabled_agents is not None else (
            'planner', 'implementer', 'reviewer', 'security_auditor'))
        if not self.enabled_agents.issubset({'planner', 'implementer', 'reviewer', 'security_auditor'}):
            raise ValueError('Unknown bundled persona')
        self.secrets, self.routing = secrets, None
        self.mcp_servers, self.a2a_bridge = dict(mcp_servers or {}), a2a_bridge
        self.worktrees, self.sandbox = worktrees, sandbox
        if not enabled:
            return
        directory = Path(state_directory).absolute()
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.store = CheckpointStore(directory / 'extension.sqlite', retention=retention)
        self.audit = Audit(self.store, secrets=secrets, exporter=exporter)
        self.store.transition = self.audit.emit
        conventional_verification = self.repository / '.extension/verification.json'
        if verification is None and conventional_verification.is_file():
            verification = self._configuration_file(conventional_verification)
        if verification is None:
            verification = {'deterministic': ['tests'],
                            'security': ['sast', 'dependencies', 'iac', 'secrets'],
                            'agentic': ['reviewer', 'security_auditor']}
            changed = subprocess.run(['git', '-C', str(self.repository), 'diff', '--name-only', 'HEAD'],
                                     check=True, text=True, capture_output=True).stdout.splitlines()
            changed += subprocess.run(['git', '-C', str(self.repository), 'ls-files', '--others', '--exclude-standard'],
                                      check=True, text=True, capture_output=True).stdout.splitlines()
            if any(Path(name).suffix in ('.html', '.css', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte')
                   for name in changed):
                verification['browser'] = ['e2e']
        self.verification = Verification(self.store, required=verification,
                                         digest=digest or (lambda: source_digest(self.repository)),
                                         audit=self.audit.emit)
        conventional_policy = self.repository / '.extension/policy.json'
        policy = rules if rules is not None else (self._configuration_file(conventional_policy)
            if conventional_policy.is_file() else json.loads((HERE / 'policies/default.json').read_text()))
        self.gateway = Gateway(self.store, rules=policy, verification=self.verification,
                               audit=self.audit.emit, interactive=interactive,
                               headless_policy=headless_policy, approve=approve,
                               secrets=secrets, retry_threshold=retry_threshold)
        if self.worktrees:
            self.worktrees.recover()
        self.conventions = Conventions(self.repository, self.store, disabled_skills=disabled_skills,
                                       context_window=context_window, secrets=secrets)

    def _configuration_file(self, path):
        if path.is_symlink() or not path.resolve().is_relative_to(self.repository):
            raise PermissionError('Extension configuration must stay in the repository')
        subprocess.run(['git', '-C', str(self.repository), 'ls-files', '--error-unmatch',
                        str(path.relative_to(self.repository))], check=True, capture_output=True)
        if path.stat().st_size > 100000:
            raise ValueError('Extension configuration too large')
        return json.loads(path.read_text())

    def set_routing(self, **options):
        self.routing = Routing(self.store, audit=self.audit.emit, **options)
        return self

    def hooks(self):
        return dict(onPreToolUse=lambda action, state: self.gateway.authorize(
                        action, state, permission=action.get('permission', 'commands')),
                    onPostToolUse=lambda value: redact(value, self.secrets),
                    onErrorOccurred=self.gateway.on_error,
                    onSessionStart=lambda metadata='': self.conventions.context(metadata),
                    onSessionEnd=self.conventions.learn_async)

    def apply(self, config, *, supported_surfaces=None):
        """Attach to hosts supporting SessionConfig extension surfaces.

        Supply the host's documented supported surface names. Unknown/optional
        capabilities warn and are omitted; no host config object is mutated.
        Existing named entries take precedence; hook chains retain user hooks.
        """
        if not self.enabled:
            return copy.copy(config)
        supported = set(supported_surfaces or ())
        result = copy.copy(config)
        agents = {name: dict(name=name, instructions=(HERE / 'agents' / (name + '.md')).read_text())
                  for name in sorted(self.enabled_agents)}
        for directory in (self.repository / '.agents/agents', self.repository / '.extension/agents'):
            if directory.is_dir():
                for path in sorted(directory.glob('*.md')):
                    if not path.is_symlink() and path.resolve().is_relative_to(self.repository):
                        agents[path.stem] = dict(name=path.stem, instructions=path.read_text()[:100000])
        skill_dirs = [str(HERE / 'skills')] + [str(path) for path in (
            self.repository / '.agents/skills', self.repository / '.extension/skills') if path.is_dir()]
        additions = dict(customAgents=agents, skillDirectories=skill_dirs,
                         hooks=self.hooks(), durability=self.store)
        if self.mcp_servers:
            additions['mcpServers'] = self.mcp_servers
        if self.a2a_bridge:
            additions['a2aBridges'] = {'trusted': self.a2a_bridge}
        if self.worktrees:
            additions['worktreePolicy'] = self.worktrees
        if self.routing:
            additions['modelRouter'] = self.routing.call
        for key, value in additions.items():
            if key not in supported:
                warnings.warn(f'{self.id}: optional host surface {key} is unavailable', RuntimeWarning)
                continue
            if key in ('customAgents', 'mcpServers', 'a2aBridges'):
                result[key] = {**value, **config.get(key, {})}
            elif key == 'skillDirectories':
                result[key] = list(dict.fromkeys([*config.get(key, []), *value]))
            elif key == 'hooks':
                existing = config.get(key, {})
                merged = {**existing}
                for name, hook in value.items():
                    chain = existing.get(name, [])
                    merged[name] = [hook, *(chain if isinstance(chain, (list, tuple)) else [chain])]
                result[key] = merged
            else:
                result.setdefault(key, value)
        return result

    def core_options(self, options):
        """Map to codingagentlib CoreAgent's actual documented public surfaces.

        This is configuration only: the caller still constructs/runs CoreAgent.
        Host model/streaming/auth remain injected. User tools stay registered.
        """
        if not self.enabled:
            return dict(options)
        result = dict(options)
        tools = list(options.get('tools', ()))
        if self.mcp_servers:
            from ..python.extensions import mcp_tools
            for server in self.mcp_servers.values():
                tools.extend(mcp_tools(transport=server['transport'], trust=server['trust']))
        permissions = {tool['name']: tool['permission'] for tool in tools}
        result['tools'] = [self.gateway.wrap_tool(tool) for tool in tools]
        user_policy = options.get('policy', {})
        result['policy'] = dict(user_policy)
        result['policy']['authorize'] = lambda action, state: (
            self.gateway.authorize(action, state, permission=permissions.get(action['tool'], 'commands')) and
            ('authorize' not in user_policy or user_policy['authorize'](action, state) is True))
        result['policy']['complete'] = lambda response, state: (
            self.gateway.complete(response, state) and
            ('complete' not in user_policy or user_policy['complete'](response, state) is True))
        if 'session_store' in options and options['session_store'] is not self.store:
            warnings.warn('User session_store retained; extension checkpoint durability is unavailable', RuntimeWarning)
        result.setdefault('session_store', self.store)
        if self.routing is None:
            warnings.warn('Model pricing/output ceilings unavailable: configure set_routing for token and monetary controls; host model retained', RuntimeWarning)
        model = self.routing.call if self.routing else options['model']
        result['model'] = self.gateway.model(model)
        context = lambda state, cancel: dict(extensionId=self.id,
                                             additionalContext=self.conventions.context(state['goal']))
        result['context_providers'] = [*options.get('context_providers', ()), context]
        user_event = options.get('on_event', lambda event: None)
        def on_event(event):
            value = redact(event, self.secrets)
            self.audit.emit('host.' + event['kind'], dict(sessionId=event['sessionId'], event=value))
            if event['kind'] == 'session_status' and event['value'].get('status') == 'complete':
                learning = str(event['value'].get('summary', ''))
                # Host may provide reviewed learning text via onSessionEnd instead.
                if learning:
                    limit = int(self.conventions.context_window * .04)
                    self.conventions.learn_async(redact(learning, self.secrets).encode()[:limit].decode('utf-8', errors='ignore'))
            if event['kind'] == 'error':
                self.gateway.on_error(event['sessionId'], 'host', json.dumps(value['value']))
            self.emit_ui(value)
            user_event(value)
        result['on_event'] = on_event
        return result

    def subagent_lifecycle(self, event):
        """Consume the host's standard lifecycle telemetry without replacing it.

        Host launches the subagent; this returns its workspace override. Successful
        branches remain until the host emits merged/aborted. Exceptions and crashed
        owners are cleaned through the same owned-worktree registry.
        """
        if not self.enabled or not self.worktrees:
            return None
        kind, value = event['kind'], event.get('value', {})
        task = value.get('taskId')
        self.audit.emit(kind, dict(sessionId=value.get('sessionId', task or 'unbound'), event=event))
        if kind == 'subagent.started':
            return str(self.worktrees.create(task, base=value.get('base', 'HEAD')))
        if kind in ('subagent.merged', 'subagent.aborted'):
            return self.worktrees.finish(task, outcome='merged' if kind.endswith('merged') else 'abort')
        if kind == 'session.recovered':
            return self.worktrees.recover()
        return None

    def emit_ui(self, event):
        # AG-UI's standardized JSON-patch state delta; no UI dependency in CI.
        if not self.enabled or not self.interactive or self.ui_mode == 'disabled' or not self.ui_sink:
            return
        session = event.get('sessionId', 'unbound')
        if session not in self._ui_sessions:
            self.ui_sink(dict(type='STATE_SNAPSHOT', snapshot={'events': []}))
            self._ui_sessions.add(session)
        self.ui_sink(dict(type='STATE_DELTA', delta=[dict(op='add', path='/events/-', value=event)]))
        waiting = event['kind'] == 'session_status' and event['value'].get('status') == 'waiting'
        proposal = event['kind'] in ('plan', 'diff')
        if waiting or proposal:
            pending = self.gateway.pending(session) if waiting else None
            text = event['value'].get('question', 'Operator review required') if waiting else json.dumps(event['value'])
            components = [dict(id='root', component={'Column': {'children': {'explicitList': ['review', 'respond']}}}),
                dict(id='review', component={'Text': {'text': {'literalString': str(text)}}}),
                dict(id='respond_label', component={'Text': {'text': {'literalString': 'Review and respond'}}}),
                dict(id='respond', component={'Button': {'child': 'respond_label', 'action': {
                    'name': 'operator_review', 'context': [
                        {'key': 'sessionId', 'value': {'literalString': session}},
                        {'key': 'actionSignature', 'value': {'literalString': (pending or {}).get('actionSignature', '')}}]}}})]
            self.ui_sink(dict(type='CUSTOM', name='a2ui', value={
                'surfaceUpdate': {'surfaceId': session, 'components': components}}))
            self.ui_sink(dict(type='CUSTOM', name='a2ui', value={
                'beginRendering': {'surfaceId': session, 'root': 'root'}}))

    def close(self):
        if self.enabled:
            self.conventions.close()
            self.audit.close()
            self.store.close()
