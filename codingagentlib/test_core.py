import copy
import json
from pathlib import Path
import threading
import unittest
from .python.core import create_agent, MemorySessionStore, replay
from .python.extensions import mcp_tools, expose_mcp, delegation_tool


def response(r, status='done', **extra):
    return {**dict(sessionId=r['sessionId'],step=r['step'],plan='Inspect evidence',status=status,action=None,summary='Observed'),**extra}


def fill(value, request):
    if value == '$session':
        return request['sessionId']
    if value == '$step':
        return request['step']
    if isinstance(value, list):
        return [fill(v,request) for v in value]
    if isinstance(value, dict):
        return {k:fill(v,request) for k,v in value.items()}
    return value


class CoreTests(unittest.TestCase):
    def test_observer_failure_is_not_repaired_as_a_model_response(self):
        calls=[]
        def observer(event):
            if event['kind']=='model_response':
                raise ValueError('Observer failed')
        agent=create_agent(model=lambda r:calls.append(r['step']) or response(r),on_event=observer)
        with self.assertRaisesRegex(ValueError,'Observer failed'):
            agent.run('Pause on host error')
        self.assertEqual(calls,[1])
        self.assertEqual(agent.snapshot()['status'],'paused')

    def test_embedded_migration_preserves_context(self):
        from .python.embedded import EmbeddedAgent
        from .python.adapters import from_embedded
        def execute(args,ctx):
            self.assertEqual(ctx['context'],dict(project='host'))
            return dict(read=True)
        embedded=EmbeddedAgent(context=dict(project='host')).add_tool('legacy',execute)
        model=lambda r:response(r) if any(e['kind']=='tool_result' for e in r['events']) else response(r,'act',action=dict(tool='legacy',args={}))
        self.assertEqual(from_embedded(embedded,model=model).run('Migrate host tools')['status'],'complete')
        restricted=from_embedded(embedded,model=model,policy=dict(authorize=lambda action,state:False))
        restricted.run('Preserve extra host policy')
        self.assertFalse(next(e['value']['ok'] for e in restricted.snapshot()['events'] if e['kind']=='tool_result'))

    def test_shared_conformance(self):
        for case in json.loads((Path(__file__).parent/'conformance/core-v1.json').read_text())['cases']:
            with self.subTest(case=case['name']):
                calls, replies, stop = [], iter(case['responses']), threading.Event()
                def model(r):
                    if case.get('cancel'):
                        stop.set()
                    return fill(next(replies),r)
                tool = dict(name='echo',description='Echo',permission=case.get('permission','read'),parameters=case.get('parameters',dict(type='object')),execute=lambda args,ctx:calls.append(args) or args)
                agent = create_agent(model=model,tools=[tool],policy=dict(complete=lambda r,s:not case.get('denyComplete')),budgets=case.get('budgets'))
                result = agent.run('Conformance',cancel_event=stop)
                if case.get('resume'):
                    result = agent.resume(result['sessionId'],answer='Continue')
                self.assertEqual(result['status'],case['expected']['status'])
                self.assertEqual(len(calls),case['expected']['calls'])
                if 'reason' in case['expected']:
                    self.assertEqual(result['reason'],case['expected']['reason'])

    def test_streaming_replay_and_uncertain_restore(self):
        calls=[]
        tool=dict(name='echo',description='Echo',permission='read',parameters=dict(type='object'),execute=lambda a,c:calls.append(a) or a)
        def model(r):
            return response(r) if any(e['kind']=='tool_result' for e in r['events']) else response(r,'act',action=dict(tool='echo',args={}))
        store=MemorySessionStore()
        agent=create_agent(model=model,tools=[tool],session_store=store)
        agent.run('Record')
        self.assertEqual(replay(agent.snapshot())['result']['status'],'complete')
        self.assertEqual(len(calls),1)
        def partial(r):
            yield json.dumps(response(r,'act',action=dict(tool='echo',args={})))
            yield 'trailing'
        self.assertEqual(create_agent(model=partial,tools=[tool]).run('No partial dispatch')['status'],'waiting')
        self.assertEqual(len(calls),1)
        def observer(event):
            if event['kind']=='tool_started':
                raise RuntimeError('Observer unavailable')
        interrupted=create_agent(model=model,tools=[tool],session_store=store,on_event=observer)
        with self.assertRaisesRegex(RuntimeError,'Observer'):
            interrupted.run('Uncertain')
        saved=interrupted.snapshot()
        restored=create_agent(model=model,tools=[tool],session_store=store)
        self.assertEqual(restored.resume(saved['id'])['reason'],'uncertain_tool_call')
        self.assertEqual(len(calls),1)
        restored.resolve_pending(saved['id'],dict(callId=saved['pending']['callId'],tool='echo',ok=False,error=dict(code='not_executed',message='Host confirmed no dispatch',retryable=False)))
        self.assertEqual(restored.resume(saved['id'])['status'],'complete')

    def test_store_leases_privacy_and_schema_preflight(self):
        store=MemorySessionStore()
        self.assertTrue(store.acquire('tenant','id','owner'))
        self.assertFalse(store.acquire('tenant','id','other'))
        store.release('tenant','id','other')
        self.assertFalse(store.acquire('tenant','id','other'))
        store.release('tenant','id','owner')
        self.assertTrue(store.acquire('tenant','id','other'))
        self.assertIsNone(store.load('foreign','id'))
        bad=dict(name='bad',description='',permission='read',parameters=dict(type='object',patternProperties={}),execute=lambda a,c:a)
        agent=create_agent(model=lambda r:response(r),tools=[bad])
        self.assertFalse(agent.preflight()['ok'])
        with self.assertRaisesRegex(ValueError,'Unsupported'):
            agent.run('Invalid schema')

    def test_mcp_and_delegation(self):
        calls=[]
        tool=dict(name='echo',description='Echo',permission='read',parameters=dict(type='object'),execute=lambda a,c:calls.append(a) or a)
        serve=expose_mcp(tools=[tool],authorize=lambda n,a,c:True)
        class Transport:
            def request(self,method,params):
                return serve(method,params)
        tools=mcp_tools(transport=Transport(),trust=lambda *args:True)
        model=lambda r:response(r) if any(e['kind']=='tool_result' for e in r['events']) else response(r,'act',action=dict(tool='echo',args={}))
        agent=create_agent(model=model,tools=tools)
        agent.run('Denied MCP')
        self.assertEqual(calls,[])
        agent.run('Allowed MCP',allow_commands=True)
        self.assertEqual(len(calls),1)
        child=delegation_tool(model=lambda r:response(r),tools=[tool])
        result=child['execute'](dict(goal='Scoped child'),dict(sessionId='parent',callId='parent_call'))
        self.assertEqual(result['result']['status'],'complete')
        with self.assertRaisesRegex(ValueError,'read-only'):
            delegation_tool(model=model,tools=[{**tool,'permission':'commands'}])
