from pathlib import Path
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import json
import tempfile
import unittest
from . import Runtime,create_model_mosaic
from .python.agent_workflows import validate,run
from .python.core import create_agent


class MosaicGraphTests(unittest.TestCase):
    def test_workflow_conformance_shared_with_graphical_editor(self):
        fixtures=json.loads((Path(__file__).parent/'conformance'/'workflows-v2.json').read_text())
        for fixture in fixtures['cases']:
            with self.subTest(name=fixture['name']):
                if fixture['valid']:validate(fixture['definition'])
                else:
                    with self.assertRaises(ValueError):validate(fixture['definition'])

    def test_runtime_mosaic_budget_is_atomic_pinned_and_persistent(self):
        with tempfile.TemporaryDirectory() as folder:
            with closing(Runtime(folder)) as runtime:
                session=runtime.dispatch(dict(op='start',goal='Bound model calls'))['id']
                profile=dict(id='pinned',profileId='code',modalities=['text'])
                policy=dict(enabled=True,maxCalls=2,routes={role:dict(profile) for role in ('plan','code','review')})
                configured=runtime.dispatch(dict(op='model_mosaic_configure',session=session,policy=policy))
                policy['maxCalls']=500;configured['value']['policy']['maxCalls']=500
                def reserve(_):
                    try:return runtime.dispatch(dict(op='model_mosaic_reserve',session=session,step=1,role='plan',model='pinned'))['value']['attempt']
                    except ValueError:return None
                with ThreadPoolExecutor(max_workers=4) as pool:attempts=list(pool.map(reserve,range(6)))
                self.assertEqual(sorted(n for n in attempts if n is not None),[1,2])
                state=runtime.dispatch(dict(op='model_mosaic_state',session=session));self.assertEqual(state['calls'],2);self.assertEqual(state['policy']['maxCalls'],2)
                state['policy']['maxCalls']=500
                with self.assertRaisesRegex(ValueError,'fixed'):runtime.dispatch(dict(op='model_mosaic_configure',session=session,policy=policy))
            with closing(Runtime(folder)) as restored:
                self.assertEqual(restored.dispatch(dict(op='model_mosaic_state',session=session))['calls'],2)
                with self.assertRaisesRegex(ValueError,'budget'):restored.dispatch(dict(op='model_mosaic_reserve',session=session,step=2,role='code',model='pinned'))

    def test_model_routes_budget_and_failed_provider_without_fallback(self):
        calls=[]
        def provider(identity):
            def model(r):
                calls.append(identity)
                return dict(sessionId=r['sessionId'],step=r['step'],status='done',plan='Inspect',summary='Complete',action=None)
            return model
        model=create_model_mosaic(models={k:provider(k) for k in ('plan','code','review')},routes=dict(default='code',plan='plan',review='review'),max_calls=3)
        self.assertEqual(create_agent(model=model).run('Plan')['status'],'complete')
        model(dict(sessionId='x',step=2,events=[]))
        model(dict(sessionId='x',step=3,events=[dict(kind='observation',value=dict(tool='run_command',ok=True,result=dict(exitCode=0))),dict(kind='turn')]))
        self.assertEqual(calls,['plan','code','review'])
        with self.assertRaisesRegex(ValueError,'budget'):model(dict(step=4))
        self.assertEqual(model.inspect()['calls'],3)

    def test_graph_hops_annotations_stable_symbols_and_revision_guards(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'code.py';source.write_text('class Base: pass\nclass Child(Base): pass\ndef helper(): return 1\ndef run(): return helper()\n')
            with closing(Runtime(folder)) as runtime:
                def graph(action,**extra):return runtime.dispatch(dict(op='project_knowledge',project='flight',action=action,**extra))
                first=graph('refresh');child=next(n for n in first['nodes'] if n['label']=='Child');base=next(n for n in first['nodes'] if n['label']=='Base')
                self.assertTrue(any(e['type']=='inherits' and e['source']==child['id'] and e['target']==base['id'] for e in first['edges']))
                self.assertTrue(any(e['type']=='calls' for e in first['edges']))
                found=graph('query',nodeIds=[child['id']],relations=['inherits'],direction='out',hops=1)
                self.assertEqual({n['id'] for n in found['nodes']},{child['id'],base['id']})
                annotated=graph('annotate',nodeId=child['id'],text='Review this dependency',expectedRevision=first['revision'])
                with self.assertRaisesRegex(ValueError,'changed'):graph('annotate',nodeId=child['id'],text='stale',expectedRevision=first['revision'])
                source.write_text('\n\n'+source.read_text());refreshed=graph('refresh')
                self.assertIn(child['id'],refreshed['annotations']);self.assertEqual(next(n['id'] for n in refreshed['nodes'] if n['label']=='Child'),child['id'])
                self.assertEqual(graph('query',nodeIds=[child['id']])['annotations'][child['id']]['text'],'Review this dependency')
                with self.assertRaisesRegex(ValueError,'Derived'):graph('forget',nodeId=child['id'],expectedRevision=refreshed['revision'])
                self.assertGreaterEqual(len(graph('history')['items']),3)
                self.assertEqual(graph('stats')['nodes'],len(refreshed['nodes']))

    def test_graphical_workflow_skill_pins_block_changed_or_disabled_procedures(self):
        with tempfile.TemporaryDirectory() as folder:
            with closing(Runtime(folder)) as runtime:
                session=runtime.dispatch(dict(op='start',goal='Workflow pins',allowEdits=True))['id']
                skill=runtime.dispatch(dict(op='skill_save',session=session,id='inspect',name='Inspect',description='Inspection procedure',content='Read before editing.',enabled=True,expectedRevision=0,evidenceCallIds=[],reason='Host procedure'))
                definition=validate(dict(format='suite-tool-workflow/v2',name='Pinned flow',description='Inspect with pinned skill',inputs={},steps=[dict(id='read',tool='list_files',args={},skills=[dict(id='inspect',revision=skill['revision'])])]))
                with self.assertRaisesRegex(ValueError,'v2'):validate({**definition,'format':'suite-tool-workflow/v1'})
                saved=runtime.dispatch(dict(op='workflow_save',session=session,id='flow',definition=definition,expectedRevision=0,evidenceCallIds=[],reason='Reviewed flow'))
                runtime.dispatch(dict(op='tool',session=session,tool='workflow_read',args=dict(id='flow',revision=saved['revision']),callId='read-flow'))
                runtime.dispatch(dict(op='skill_save',session=session,id='inspect',name='Inspect',description='Changed',content='New procedure.',enabled=False,expectedRevision=skill['revision'],evidenceCallIds=[],reason='Disable'))
                result=runtime.dispatch(dict(op='tool',session=session,tool='workflow_run',args=dict(id='flow',revision=saved['revision'],inputs={}),callId='flow-run'))
                self.assertFalse(result['ok']);self.assertEqual(result['result']['status'],'failed');self.assertIn('Pinned skill',result['result']['reason']);self.assertEqual(result['result']['steps'],[])
