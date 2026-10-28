import unittest
from codingagentlib import EmbeddedAgent, ContextRegistry

def reply(r,status,**extra):return dict(sessionId=r['sessionId'],step=r['step'],plan='Public integration plan',status=status,action=None,**extra)

class IntegrationTests(unittest.TestCase):
    def test_dynamic_context_resume_and_tool_context(self):
        project={'revision':1,'selected':'a'}
        registry=ContextRegistry(base={'app':'editor'}).add('project',lambda state,cancel:dict(revision=str(project['revision']),data=dict(project)),schema={'type':'object'})
        agent=EmbeddedAgent(context_provider=registry.provider(),tool_available=lambda tool,context,state:tool['name']!='hidden')
        def select(args,ctx):
            self.assertEqual(ctx['context']['sources'][0]['revision'],'1');project.update(revision=2,selected='b');return dict(project)
        agent.add_tool('select',select).add_tool('hidden',lambda args,ctx:self.fail('Hidden tool executed'))
        def model(r):
            self.assertEqual([t['name'] for t in r['tools']],['select'])
            if r['step']==1:return {**reply(r,'act'),'action':{'tool':'select','args':{}}}
            self.assertEqual(r['context']['sources'][0]['data']['selected'],'b');return reply(r,'ask',question='Keep it?')
        self.assertEqual(agent.run('Select',model)['status'],'waiting')
        project['revision']=3
        def done(r):self.assertEqual(r['context']['sources'][0]['revision'],'3');return reply(r,'done',summary='Observed selection')
        self.assertEqual(agent.resume('Yes',done)['status'],'complete')

    def test_revoked_tool_and_provider_failure(self):
        allowed=[True];calls=[]
        agent=EmbeddedAgent(context_provider=lambda state,cancel:{'live':True},tool_available=lambda *args:allowed[0]).add_tool('edit',lambda args,ctx:calls.append(True),permission='edits')
        def model(r):allowed[0]=False;return {**reply(r,'act'),'action':{'tool':'edit','args':{}}}
        result=agent.run('Edit',model,allow_edits=True,max_steps=1)
        self.assertEqual(calls,[]);self.assertEqual(result['metrics']['failedTools'],1)
        def broken(state,cancel):raise RuntimeError('Source unavailable')
        agent=EmbeddedAgent(context_provider=broken)
        with self.assertRaisesRegex(RuntimeError,'Source unavailable'):agent.run('Inspect',lambda r:self.fail('Stale context used'))
        self.assertEqual(agent.snapshot()['status'],'paused')

    def test_sources_and_copying(self):
        data={'value':1};registry=ContextRegistry().add('project',lambda *args:{'revision':'1','data':data})
        with self.assertRaises(ValueError):registry.add('project',lambda *args:None)
        result=registry.resolve({});result['sources'][0]['data']['value']=2;self.assertEqual(data['value'],1)
        registry.remove('project').add('bad',lambda *args:{'data':{}})
        with self.assertRaises(ValueError):registry.resolve({})
        registry.remove('bad');self.assertEqual(registry.resolve({})['sources'],[])
if __name__=='__main__':unittest.main()
