"""Extension acceptance checks against public SDK callbacks and real processes."""
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import warnings

from codingagentlib import create_agent
from codingagentlib.extension_pack.adapter import ExtensionPack
from codingagentlib.extension_pack.audit import redact
from codingagentlib.extension_pack.durability import CheckpointStore
from codingagentlib.extension_pack.protocols import DomainMCP
from codingagentlib.extension_pack.routing import Tier
from codingagentlib.extension_pack.worktrees import Worktrees
from codingagentlib.python.extensions import mcp_tools


def reply(request, status='done', action=None, **extra):
    return dict(sessionId=request['sessionId'], step=request['step'], status=status,
                plan='Exercise actual extension boundary', action=action,
                **({'summary': 'Observed completion'} if status == 'done' else {}), **extra)


def tool(name, execute, permission='read'):
    return dict(name=name, version=1, description='Test host tool', permission=permission,
                parameters={'type': 'object'}, execute=execute)


class RepositoryCase(unittest.TestCase):
    def setUp(self):
        self.warning_context = warnings.catch_warnings()
        self.warning_context.__enter__()
        warnings.filterwarnings('ignore', message='Model pricing/output ceilings unavailable.*')
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.email', 'extension-test@example.invalid')
        self.git('config', 'user.name', 'Extension Test')
        (self.repo / 'file.txt').write_text('original\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'base')
        self.pack = ExtensionPack(self.repo, self.root / 'state', verification={})

    def tearDown(self):
        self.pack.close()
        self.temp.cleanup()
        self.warning_context.__exit__(None, None, None)

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], capture_output=True,
                              text=True, check=True).stdout


class PackTests(RepositoryCase):
    def test_disabled_is_identity_and_no_storage(self):
        disabled = ExtensionPack(self.repo, self.root / 'absent', enabled=False, ui_mode='unavailable', enabled_agents=['unknown'])
        model = lambda r: reply(r)
        options = dict(model=model, tools=[])
        self.assertEqual(disabled.core_options(options), options)
        self.assertEqual(disabled.apply(options), options)
        self.assertFalse((self.root / 'absent').exists())
        base = create_agent(**options).run('baseline')
        extension = create_agent(**self.pack.core_options(options)).run('baseline')
        self.assertEqual(base['status'], extension['status'])

    def test_composition_preserves_overrides_and_warns(self):
        custom = {'reviewer': {'instructions': 'User reviewer'}}
        callback = lambda *a: True
        config = dict(customAgents=custom, skillDirectories=['mine'], hooks={'onPreToolUse': callback})
        merged = self.pack.apply(config, supported_surfaces=['customAgents', 'skillDirectories', 'hooks', 'durability'])
        self.assertEqual(merged['customAgents']['reviewer'], custom['reviewer'])
        self.assertEqual(len(merged['customAgents']), 4)
        self.assertEqual(merged['hooks']['onPreToolUse'][-1], callback)
        self.assertEqual(config['skillDirectories'], ['mine'])
        with warnings.catch_warnings(record=True) as caught:
            self.pack.apply({})
        self.assertEqual(len(caught), 4)

    def test_shared_host_conformance_loaded_and_unloaded(self):
        import threading
        from codingagentlib.test_core import fill
        cases = json.loads((Path(__file__).parent / 'conformance/core-v1.json').read_text())['cases']
        for enabled in (False, True):
            for case in cases:
                with self.subTest(enabled=enabled, case=case['name']):
                    calls, responses, stop = [], iter(case['responses']), threading.Event()
                    def model(r):
                        if case.get('cancel'):
                            stop.set()
                        return fill(next(responses), r)
                    host_tool = dict(name='echo', description='Echo', permission=case.get('permission', 'read'),
                        parameters=case.get('parameters', {'type': 'object'}), execute=lambda a, c: calls.append(a) or a)
                    options = dict(model=model, tools=[host_tool],
                        policy={'complete': lambda r, s: not case.get('denyComplete')}, budgets=case.get('budgets'))
                    agent = create_agent(**(self.pack.core_options(options) if enabled else options))
                    result = agent.run('Conformance', cancel_event=stop)
                    if case.get('resume'):
                        result = agent.resume(result['sessionId'], answer='Continue')
                    self.assertEqual(result['status'], case['expected']['status'])
                    self.assertEqual(len(calls), case['expected']['calls'])
                    if 'reason' in case['expected']:
                        self.assertEqual(result['reason'], case['expected']['reason'])

    def test_verification_escalation_can_resume_only_after_green(self):
        self.pack.verification.required = {'deterministic': ['tests']}
        agent = create_agent(**self.pack.core_options(dict(model=lambda r: reply(r))))
        result = agent.run('gated completion')
        self.assertEqual(result['status'], 'waiting')
        with self.assertRaises(PermissionError):
            self.pack.gateway.resolve_escalation(result['sessionId'], 'not actually checked')
        self.pack.verification.run(result['sessionId'], 'deterministic', 'tests', lambda: {'ok': True})
        self.pack.gateway.resolve_escalation(result['sessionId'], 'Verified current source')
        self.assertEqual(agent.resume(result['sessionId'])['status'], 'complete')

    def test_approval_survives_reopen_and_exact_resume(self):
        attempts = []
        def model(r):
            return reply(r) if any(e['kind'] == 'tool_result' and e['value']['ok'] for e in r['events']) else reply(
                r, 'act', dict(tool='write', args={'text': 'approved'}))
        options = dict(model=model, tools=[tool('write', lambda a, c: attempts.append(a) or {'ok': True}, 'edits')])
        agent = create_agent(**self.pack.core_options(options))
        result = agent.run('write safely', allow_edits=True)
        self.assertEqual(result['status'], 'waiting')
        self.assertEqual(attempts, [])
        session = result['sessionId']
        signature = self.pack.gateway.pending(session)['actionSignature']
        self.pack.close()
        self.pack = ExtensionPack(self.repo, self.root / 'state', verification={})
        self.pack.gateway.approve_pending(session, signature)
        resumed = create_agent(**self.pack.core_options(options)).resume(session, allow_edits=True)
        self.assertEqual(resumed['status'], 'complete')
        self.assertEqual(attempts, [{'text': 'approved'}])
        self.assertTrue(self.pack.audit.verify())

    def test_verification_current_session_and_drift(self):
        self.pack.verification.required = {'deterministic': ['unit'], 'browser': ['flow'], 'security': ['scan'], 'agentic': ['review']}
        for layer, names in self.pack.verification.required.items():
            self.assertTrue(self.pack.verification.run('one', layer, names[0], lambda: {'ok': True}))
        self.assertTrue(self.pack.verification.ready('one'))
        self.assertFalse(self.pack.verification.ready('two'))
        action = dict(tool='create_pr', args={})
        self.assertTrue(self.pack.gateway.authorize(action, {'id': 'one'}))
        (self.repo / 'file.txt').write_text('drift')
        self.assertFalse(self.pack.gateway.authorize(action, {'id': 'one'}))
        self.assertFalse(self.pack.gateway.complete({}, {'id': 'one'}))

    def test_redaction_before_context_and_audit(self):
        secret = 'sk-' + 'a' * 20
        host_events = []
        def model(r):
            if any(e['kind'] == 'tool_result' for e in r['events']):
                self.assertNotIn(secret, json.dumps(r))
                return reply(r)
            return reply(r, 'act', dict(tool='read', args={}))
        agent = create_agent(**self.pack.core_options(dict(model=model, on_event=host_events.append,
            tools=[tool('read', lambda a, c: {'api_key': 'raw', 'message': secret})])))
        self.assertEqual(agent.run('redact')['status'], 'complete')
        self.assertNotIn(secret, json.dumps(host_events))
        self.assertNotIn(secret, json.dumps(self.pack.audit.export()))
        with self.assertRaises(sqlite3.IntegrityError):
            self.pack.store.db.execute('DELETE FROM extension_audit')
        row = self.pack.store.db.execute('SELECT * FROM extension_audit LIMIT 1').fetchone()
        with self.assertRaises(sqlite3.IntegrityError):
            self.pack.store.db.execute('INSERT OR REPLACE INTO extension_audit VALUES(?,?,?,?)', row)

    def test_retry_escalates_without_model_loop(self):
        calls = []
        def fail(a, c):
            raise ValueError('same operation, changing diagnostics ' + str(len(calls)))
        def model(r):
            calls.append(r['step'])
            return reply(r, 'act', dict(tool='check', args={}))
        agent = create_agent(**self.pack.core_options(dict(model=model, tools=[tool('check', fail)])))
        result = agent.run('retry')
        self.assertEqual(result['status'], 'waiting')
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.pack.gateway.pending(result['sessionId'])['reason'], 'retry_threshold')

    def test_cost_reservations_and_routing_survive_restart(self):
        calls = []
        def model(r):
            calls.append('fast')
            return reply(r)
        self.pack.set_routing(tiers={'fast': Tier(model, 20, 1, 1)}, token_cap=10000,
                              cost_cap_micro_usd=10000, classify=lambda r: 'fast')
        request = dict(sessionId='budget', step=1, goal='format')
        self.assertEqual(self.pack.routing.call(request)['status'], 'done')
        usage = self.pack.routing.usage('budget')
        self.assertEqual(calls, ['fast'])
        self.pack.routing.token_cap = usage['tokens']
        self.assertEqual(self.pack.routing.call(request)['status'], 'ask')
        self.assertEqual(calls, ['fast'])

    def test_tier_money_warning_and_restart_lineage(self):
        calls = []
        model = lambda r: calls.append(1) or reply(r)
        args = dict(tiers={'reasoning': Tier(model, 10, 1, 1)}, token_cap=10000,
                    cost_cap_micro_usd=1000, warning_ratio=.01)
        self.pack.set_routing(**args)
        request = dict(sessionId='root-job', step=1, goal='bounded')
        self.pack.routing.call(request)
        usage = self.pack.routing.usage('root-job')
        self.pack.store.db.execute('INSERT INTO extension_lineage VALUES(?,?)', ('branch-job', 'root-job'))
        self.pack.close()
        self.pack = ExtensionPack(self.repo, self.root / 'state', verification={})
        self.pack.set_routing(**{**args, 'cost_cap_micro_usd': usage['microUsd']})
        self.assertEqual(self.pack.routing.usage('branch-job'), usage)
        request['sessionId'] = 'branch-job'
        self.assertEqual(self.pack.routing.call(request)['status'], 'ask')
        self.assertEqual(len(calls), 1)
        exported = json.dumps(self.pack.audit.export())
        self.assertIn('budget.warning', exported)
        self.assertEqual(self.pack.routing._classify({'context': [{'taskMetadata': {'routine': True}}]}), 'fast')

    def test_concurrent_worktree_indexes_and_lifecycle(self):
        from concurrent.futures import ThreadPoolExecutor
        manager = Worktrees(self.repo, self.root / 'concurrent-trees')
        self.pack.worktrees = manager
        a = Path(self.pack.subagent_lifecycle(dict(kind='subagent.started', value={'taskId': 'a'})))
        b = Path(self.pack.subagent_lifecycle(dict(kind='subagent.started', value={'taskId': 'b'})))
        def edit(path):
            (path / 'file.txt').write_text(str(path))
            subprocess.run(['git', '-C', str(path), 'add', 'file.txt'], check=True, capture_output=True)
            return subprocess.check_output(['git', '-C', str(path), 'show', ':file.txt'], text=True)
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(edit, [a, b]))
        self.assertEqual(results, [str(a), str(b)])
        self.pack.subagent_lifecycle(dict(kind='subagent.merged', value={'taskId': 'a'}))
        self.pack.subagent_lifecycle(dict(kind='subagent.aborted', value={'taskId': 'b'}))
        self.assertFalse(a.exists() or b.exists())

    def test_policy_destructive_headless_and_conflict(self):
        self.assertFalse(self.pack.gateway.authorize(dict(tool='run_command', args={'command': 'rm -rf /'}),
                                                    {'id': 'policy'}, permission='commands'))
        self.pack.gateway.rules['approvalAllowlist'] = ['write']
        action = dict(tool='write', args={'text': 'safe'})
        self.pack.gateway.headless_policy = 'allow_allowlisted'
        self.assertTrue(self.pack.gateway.authorize(action, {'id': 'policy'}, permission='edits'))
        self.pack.gateway.escalate('conflict', 'conflicting_requirements', requirements=['keep A', 'remove A'])
        self.assertEqual(self.pack.gateway.model(lambda r: self.fail('Model must not run'))(
            {'sessionId': 'conflict', 'step': 1})['status'], 'ask')
        self.pack.gateway.resolve_escalation('conflict', 'Operator selected the maintained requirement')
        self.assertIsNone(self.pack.gateway.pending('conflict'))

    def test_worktree_overlapping_files_and_cleanup(self):
        manager = Worktrees(self.repo, self.root / 'worktrees')
        a, b = manager.create('a'), manager.create('b')
        (a / 'file.txt').write_text('one')
        (b / 'file.txt').write_text('two')
        self.assertEqual((a / 'file.txt').read_text(), 'one')
        self.assertEqual((b / 'file.txt').read_text(), 'two')
        self.assertEqual((self.repo / 'file.txt').read_text(), 'original\n')
        other = Worktrees(self.repo, self.root / 'worktrees')
        self.assertEqual(other.recover(), [])
        manager.finish('a', outcome='merged')
        manager.finish('b')
        self.assertFalse(a.exists() or b.exists())

    def test_mcp_namespace_filter_and_host_adapter(self):
        server = DomainMCP('domain', [tool('data', lambda a, c: {'keep': 'yes', 'secret': 'no', 'large': 'x' * 5000})],
                           authorize=lambda *a: True, audit=self.pack.audit.emit, fields=['keep'])
        imported = mcp_tools(transport=server, trust=lambda *a: True)
        self.assertEqual(imported[0]['name'], 'domain.data')
        result = imported[0]['execute']({}, dict(sessionId='mcp'))
        self.assertEqual(result['structuredContent']['result'], {'keep': 'yes'})

    def test_checkpoint_fork_does_not_repeat_verified_tool(self):
        calls = []
        def model(r):
            if any(e['kind'] == 'tool_result' for e in r['events']):
                return reply(r, 'ask', question='approval boundary')
            return reply(r, 'act', dict(tool='read', args={}))
        options = dict(model=model, tools=[tool('read', lambda a, c: calls.append(1) or 'verified')])
        result = create_agent(**self.pack.core_options(options)).run('checkpoint')
        checkpoints = self.pack.store.checkpoints('default', result['sessionId'])
        selected = next(c for c in checkpoints if c['state']['events'] and c['state']['events'][-1]['kind'] == 'tool_result')
        branch = self.pack.store.fork('default', result['sessionId'], selected['checkpointId'])
        resumed = create_agent(**self.pack.core_options(options)).resume(branch)
        self.assertEqual(resumed['status'], 'waiting')
        self.assertEqual(calls, [1])

    def test_process_kill_releases_lease_and_durable_approval(self):
        db = self.root / 'crash' / 'session.sqlite'
        marker = self.root / 'ready'
        code = '''
import json,sys,time
from codingagentlib import create_agent
from codingagentlib.extension_pack.durability import CheckpointStore
store=CheckpointStore(sys.argv[1])
def model(r):
 print(r['sessionId'],flush=True)
 return dict(sessionId=r['sessionId'],step=r['step'],status='ask',plan='Wait for approval',action=None,question='Approve?')
def event(e):
 if e['kind']=='session_status':
  from pathlib import Path
  Path(sys.argv[2]).write_text(e['sessionId'])
  time.sleep(60)
create_agent(model=model,session_store=store).run('durable')
'''
        # Interrupt while the observer still holds the session lease.
        code = code.replace('model=model,session_store=store', 'model=model,session_store=store,on_event=event')
        process = subprocess.Popen([sys.executable, '-c', code, str(db), str(marker)], stdout=subprocess.PIPE, text=True)
        try:
            session = process.stdout.readline().strip()
            deadline = time.monotonic() + 10
            while not marker.exists() and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertTrue(marker.exists())
            process.kill(); process.wait(timeout=5)
            store = CheckpointStore(db)
            try:
                result = create_agent(model=lambda r: reply(r), session_store=store).resume(session, answer='approved')
                self.assertEqual(result['status'], 'complete')
            finally:
                store.close()
        finally:
            if process.poll() is None:
                process.kill(); process.wait()
            process.stdout.close()

class ProtocolAndSandboxTests(RepositoryCase):
    """Protocol, conventions, latency and optional real container checks."""
    def test_authenticated_a2a_card_task_state_and_impersonation(self):
        import http.server
        import threading
        import urllib.error
        from codingagentlib import A2AServer, agent_card
        from codingagentlib.extension_pack.protocols import TrustedA2A
        seen = []
        server_impl = A2AServer(handler=lambda goal, params: dict(status='complete', summary=goal))
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                seen.append(self.headers.get('Authorization'))
                if self.headers.get('Authorization') != 'Bearer trusted-token':
                    self.send_error(401); return
                body = json.dumps(server_impl.card).encode()
                self.send_response(200); self.end_headers(); self.wfile.write(body)
            def do_POST(self):
                seen.append(self.headers.get('Authorization'))
                if self.headers.get('Authorization') != 'Bearer trusted-token':
                    self.send_error(401); return
                frame = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                body = json.dumps(server_impl.handle(frame)).encode()
                self.send_response(200); self.end_headers(); self.wfile.write(body)
        server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
        base = f'http://127.0.0.1:{server.server_port}'
        server_impl.card = agent_card(name='VerifiedAgent', url=base + '/a2a')
        worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
        registry = {'peer': dict(cardUrl=base + '/.well-known/agent.json', identity='VerifiedAgent')}
        try:
            bridge = TrustedA2A(registry, token_provider=lambda n: 'trusted-token',
                verify_identity=lambda n, card, token: token == 'Bearer trusted-token' and card['name'] == 'VerifiedAgent',
                audit=self.pack.audit.emit)
            task = bridge.delegate('peer', 'Inspect the specification', session_id='parent')
            self.assertEqual(task['status']['state'], 'completed')
            self.assertEqual(bridge.task('peer', task['id'])['id'], task['id'])
            self.assertEqual(bridge.cancel('peer', task['id'])['status']['state'], 'canceled')
            self.assertTrue(all(header == 'Bearer trusted-token' for header in seen))
            registry['peer']['identity'] = 'Impersonator'
            with self.assertRaises(PermissionError):
                bridge.discover('peer')
            registry['peer']['identity'] = 'VerifiedAgent'
            bad = TrustedA2A(registry, token_provider=lambda n: '', verify_identity=lambda *a: True,
                             audit=self.pack.audit.emit)
            with self.assertRaises(PermissionError):
                bad.delegate('peer', 'no credentials', session_id='parent')
        finally:
            server.shutdown(); server.server_close(); worker.join()

    def test_conventions_fresh_clone_progressive_cap_and_memory(self):
        directory = self.repo / '.agents/skills/python-check'
        directory.mkdir(parents=True)
        (directory / 'SKILL.md').write_text('---\nname: python-check\ndescription: Python verification changes\n---\n' + 'body\n' * 500)
        (self.repo / 'AGENTS.md').write_text('Repository instructions\n' * 1000)
        self.git('add', '.'); self.git('commit', '-qm', 'conventions')
        metadata = self.pack.conventions.skills('Python')
        self.assertEqual(metadata[0]['id'], 'python-check')
        self.assertLess(len(metadata[0]['metadata']), 200)
        self.assertNotIn('body', metadata[0]['metadata'])
        (self.repo / 'module.py').write_text('def fresh_symbol():\n    return 1\n')
        self.git('add', 'module.py'); self.git('commit', '-qm', 'fresh symbol added')
        self.assertEqual(self.pack.conventions.inspect('fresh_symbol', kind='symbols')[0]['symbol'], 'fresh_symbol')
        self.assertTrue(self.pack.conventions.inspect('return 1', kind='text'))
        self.assertTrue(self.pack.conventions.inspect('fresh symbol', kind='history'))
        self.assertIn('body', self.pack.conventions.load_skill('python-check'))
        self.pack.conventions.learn_async('Prefer verification before completion').result(timeout=5)
        context = self.pack.conventions.context('Python')
        self.assertLessEqual(len(context.encode()), int(self.pack.conventions.context_window * .04))
        self.pack.conventions.disabled.add('python-check')
        self.assertEqual(self.pack.conventions.skills('Python'), [])
        with self.assertRaises(PermissionError):
            self.pack.conventions.load_skill('python-check')

    def test_local_hook_p95_and_headless_ui(self):
        timings = []
        for _ in range(100):
            start = time.perf_counter()
            self.assertTrue(self.pack.gateway.authorize(dict(tool='read', args={}), {'id': 'latency'}))
            redact({'api_key': 'secret', 'text': 'normal text'})
            timings.append((time.perf_counter() - start) * 1000)
        p95 = sorted(timings)[94]
        self.assertLess(p95, 50)
        events = []
        self.pack.ui_sink = events.append
        self.pack.emit_ui(dict(kind='session_status', sessionId='headless', value={'status': 'waiting'}))
        self.assertEqual(events, [])
        self.pack.interactive = True
        self.pack.emit_ui(dict(kind='session_status', sessionId='interactive', value={'status': 'waiting'}))
        self.assertEqual(events[0]['type'], 'STATE_SNAPSHOT')
        self.assertEqual(events[1]['type'], 'STATE_DELTA')
        self.assertIn('surfaceUpdate', events[2]['value'])
        self.assertIn('beginRendering', events[3]['value'])
        self.pack.ui_mode = 'disabled'
        self.pack.emit_ui(dict(kind='other', value={}))
        self.assertEqual(len(events), 4)

    def test_worktree_crash_recovery(self):
        directory = self.root / 'crashed-worktrees'
        code = '''
import sys,time
from codingagentlib.extension_pack.worktrees import Worktrees
manager=Worktrees(sys.argv[1],sys.argv[2])
path=manager.create('crashed')
(path/'file.txt').write_text('partial task')
print(path,flush=True)
time.sleep(60)
'''
        process = subprocess.Popen([sys.executable, '-c', code, str(self.repo), str(directory)],
                                   stdout=subprocess.PIPE, text=True)
        try:
            path = Path(process.stdout.readline().strip())
            process.kill(); process.wait(timeout=5)
            manager = Worktrees(self.repo, directory)
            self.assertEqual(manager.recover(), ['crashed'])
            self.assertFalse(path.exists())
            self.assertEqual((self.repo / 'file.txt').read_text(), 'original\n')
        finally:
            if process.poll() is None:
                process.kill(); process.wait()
            process.stdout.close()

    @unittest.skipUnless(os.environ.get('TLAL_EXTENSION_SANDBOX_IMAGE'), 'Set pinned sandbox image to run Docker acceptance checks')
    def test_real_sandbox_and_code_action_round_trip_reduction(self):
        from codingagentlib.extension_pack.sandbox import Sandbox
        sandbox = Sandbox(image=os.environ['TLAL_EXTENSION_SANDBOX_IMAGE'], timeout=20)
        source = '''
import json,os,socket,sys
assert os.getuid()==65534
assert 'NoNewPrivs:\\t1' in open('/proc/self/status').read()
assert int(open('/sys/fs/cgroup/memory.max').read())==268435456
try:
 open('/input/file.txt','w').write('forbidden')
except OSError:
 pass
else:
 raise AssertionError('Writable repository')
s=socket.socket();s.settimeout(.2)
try:
 s.connect(('1.1.1.1',443))
except OSError:
 pass
else:
 raise AssertionError('Network allowed')
values=json.load(sys.stdin)
for _ in range(4):values=[x+1 for x in values]
print(json.dumps(values))
'''
        batch = tool('batch', lambda a, c: sandbox.code_action(source, a['values'], repository=self.repo))
        sequential = tool('increment', lambda a, c: [x + 1 for x in a['values']])
        def execute(host_tool, count):
            server = DomainMCP('ext', [host_tool], authorize=lambda *a: True, audit=self.pack.audit.emit)
            tools = mcp_tools(transport=server, trust=lambda *a: True)
            def model(r):
                results = [e['value']['result']['structuredContent']['result'] for e in r['events']
                           if e['kind'] == 'tool_result' and e['value']['ok']]
                if len(results) == count:
                    return reply(r)
                values = results[-1] if results else [1, 2, 3]
                return reply(r, 'act', dict(tool=tools[0]['name'], args={'values': values}))
            agent = create_agent(model=model, tools=tools)
            result = agent.run('transform', allow_commands=True)
            observed = [e['value']['result']['structuredContent']['result'] for e in agent.snapshot()['events']
                        if e['kind'] == 'tool_result'][-1]
            return result['usage']['modelCalls'], observed
        baseline_calls, baseline = execute(sequential, 4)
        batch_calls, consolidated = execute(batch, 1)
        self.assertTrue(consolidated['ok'], consolidated)
        self.assertEqual(json.loads(consolidated['stdout']), baseline)
        self.assertGreaterEqual((baseline_calls - batch_calls) / baseline_calls, .25)
        self.assertEqual((baseline_calls, batch_calls), (5, 2))

    @unittest.skipUnless(os.environ.get('TLAL_EXTENSION_SANDBOX_IMAGE'), 'Set pinned image for crash deadline test')
    def test_sandbox_deadline_survives_host_sigkill(self):
        def containers():
            return set(subprocess.check_output(['docker', 'ps', '-q', '--filter', 'name=tlal-ext-'], text=True).split())
        before = containers()
        code = "from codingagentlib.extension_pack import Sandbox;import sys;Sandbox(image=sys.argv[1],timeout=2).code_action('import time;time.sleep(60)',None)"
        process = subprocess.Popen([sys.executable, '-c', code, os.environ['TLAL_EXTENSION_SANDBOX_IMAGE']],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        created = set()
        try:
            deadline = time.monotonic() + 10
            while not created and time.monotonic() < deadline:
                created = containers() - before
                time.sleep(.05)
            self.assertTrue(created, 'Container did not start')
            process.kill(); process.wait(timeout=5)
            deadline = time.monotonic() + 8
            while created.intersection(containers()) and time.monotonic() < deadline:
                time.sleep(.05)
            self.assertFalse(created.intersection(containers()), 'Container survived its internal wall-clock deadline')
        finally:
            if process.poll() is None:
                process.kill(); process.wait()
            for container in created:
                subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=5)

    @unittest.skipUnless(os.environ.get('TLAL_EXTENSION_SANDBOX_IMAGE'), 'Set pinned browser sandbox image for E2E')
    def test_real_browser_navigation_form_dom_and_trace_export(self):
        from codingagentlib.extension_pack.sandbox import Sandbox
        sandbox = Sandbox(image=os.environ['TLAL_EXTENSION_SANDBOX_IMAGE'], timeout=45,
                          memory_mb=1024, cpus=2)
        result = sandbox.run(['python3', '/input/codingagentlib/extension_pack/browser_smoke.py'],
                             repository=Path(__file__).resolve().parents[1])
        self.assertTrue(result['ok'], result['stderr'])
        self.assertEqual(len(json.loads(result['stdout'])['checks']), 6)


if __name__ == '__main__':
    unittest.main()
