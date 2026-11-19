import json
from pathlib import Path
import sys
import tempfile
import unittest
from . import Agent,Runtime
from .python.mcp_transports import RPCTransport,ShellMCP
from .rpc import MCPService

SOURCE='''# codingagent-tool: {"id":"echo_json","name":"Echo JSON","parameters":{"type":"object"}}
import argparse,json
p=argparse.ArgumentParser()
p.add_argument('--input-json',default='{}')
args=p.parse_args()
print(json.dumps(json.loads(args.input_json),sort_keys=True))
'''


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(self.enterContext(tempfile.TemporaryDirectory()))
        (self.root/'main.py').write_text('import json\nclass Example:\n    def run(self):\n        return 1\n')
        (self.root/'needs.rst').write_text('.. req:: A\n   :id: REQ_A\n   :links: TEST_A\n\n.. test:: Verify A\n   :id: TEST_A\n')
        (self.root/'.env').write_text('SECRET=must-not-index')
        self.runtime=Runtime(self.root,[sys.executable]);self.addCleanup(self.runtime.close)

    def test_automatic_graph_scope_export_import_and_ontology(self):
        session=self.runtime.dispatch(dict(op='start',goal='Inspect Example'))
        graph=self.runtime.dispatch(dict(op='project_knowledge',project=self.root.name,action='export'))
        self.assertTrue(any(n['label']=='Example' for n in graph['nodes']))
        self.assertTrue(any(c['label']=='Example' for c in graph['ontology']['classes']))
        self.assertTrue(any(e['type']=='depends_on' for e in graph['edges']))
        self.assertNotIn('.env',json.dumps(graph))
        turn=self.runtime.dispatch(dict(op='turn',session=session['id']))
        self.assertIn('projectKnowledge',turn)
        empty=self.runtime.dispatch(dict(op='project_knowledge',project='other',action='export'))
        self.assertEqual(empty['nodes'],[])
        imported=self.runtime.dispatch(dict(op='project_knowledge',project='other',action='import',payload=graph,expectedRevision='missing'))
        self.assertEqual(imported['project'],'other')
        self.assertEqual(len(imported['nodes']),len(graph['nodes']))
        ontology=self.runtime.dispatch(dict(op='project_knowledge',project='other',action='ontology'))
        self.assertEqual(ontology['format'],'codingagentlib/project-ontology-v1')
        with self.assertRaisesRegex(ValueError,'changed'):
            self.runtime.dispatch(dict(op='project_knowledge',project='other',action='import',payload=graph,expectedRevision='missing'))
        bad={**graph,'edges':[dict(source='missing',target='missing',type='depends_on')]}
        with self.assertRaisesRegex(ValueError,'invalid'):
            self.runtime.dispatch(dict(op='project_knowledge',project='other',action='import',payload=bad,expectedRevision=imported['revision']))

    def test_refresh_detects_edits_and_keeps_custom_graph(self):
        with Agent(self.root) as agent:
            session=agent.start('Inspect',allow_edits=True)
            first=agent.next(session['id']);self.assertIn('projectKnowledge',first)
            data=agent.runtime.path('main.py').read_text()
            from .python.agent_runtime import digest
            agent.submit(session['id'],dict(sessionId=session['id'],step=first['step'],status='act',plan='Change source',action=dict(tool='write_file',args=dict(path='main.py',expectedHash=digest(data.encode()),content='class Changed: pass\n'))))
            second=agent.next(session['id'])
            self.assertTrue(any(n['label']=='Changed' for n in second['projectKnowledge']['nodes']))

    def test_python_imports_resolve_packages_relative_modules_and_src_layout(self):
        files={
            'pkg/__init__.py':'from . import sibling\n',
            'pkg/a.py':'from . import sibling\nfrom .sibling import value\nfrom .sub import child\nfrom pathlib import Path\n',
            'pkg/sibling.py':'value=1\n',
            'pkg/sub/__init__.py':'',
            'pkg/sub/child.py':'from .. import sibling\n',
            'src/other/__init__.py':'',
            'src/other/tool.py':'import pkg.sibling\nfrom pkg import sibling\nfrom . import local\n',
            'src/other/local.py':'',
            'entry.py':'import other.tool\nfrom other import local\nfrom . import main\n',
            'pkg/outside.py':'from ... import main\n',
        }
        for path,content in files.items():
            target=self.root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content)
        graph=self.runtime.dispatch(dict(op='project_knowledge',project='imports',action='refresh'))
        nodes={n['id']:n for n in graph['nodes']}
        def targets(path):
            return [nodes[e['target']] for e in graph['edges'] if e['type']=='imports' and nodes[e['source']].get('source',{}).get('path')==path]
        def local(path):return {n['source']['path'] for n in targets(path) if n['type']=='File'}
        self.assertEqual(local('pkg/__init__.py'),{'pkg/sibling.py'})
        self.assertEqual(local('pkg/a.py'),{'pkg/sibling.py','pkg/sub/child.py'})
        self.assertEqual(local('pkg/sub/child.py'),{'pkg/sibling.py'})
        self.assertEqual(local('src/other/tool.py'),{'pkg/sibling.py','src/other/local.py'})
        self.assertEqual(local('entry.py'),{'src/other/tool.py','src/other/local.py'})
        self.assertEqual(local('pkg/outside.py'),set())
        self.assertTrue(any(n['type']=='Module' and n['label']=='pathlib' for n in targets('pkg/a.py')))
        self.assertTrue(any(n['label']=='.main' for n in targets('entry.py')))
        self.assertTrue(any(n['label']=='...main' for n in targets('pkg/outside.py')))
        # Derived import edges are rebuilt after source removal, rather than retained as memory.
        (self.root/'pkg/sibling.py').unlink()
        updated=self.runtime.dispatch(dict(op='project_knowledge',project='imports',action='refresh'))
        self.assertFalse(any(n.get('source',{}).get('path')=='pkg/sibling.py' for n in updated['nodes']))
        self.assertNotEqual(updated['revision'],graph['revision'])

    def test_ambiguous_python_imports_remain_references_and_relative_stays_local(self):
        for path,content in {'pkg/__init__.py':'','pkg/b.py':'', 'src/pkg/__init__.py':'',
                             'src/pkg/b.py':'','pkg/a.py':'import pkg.b\nfrom . import b\n'}.items():
            target=self.root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content)
        graph=self.runtime.dispatch(dict(op='project_knowledge',project='ambiguous',action='refresh'))
        nodes={n['id']:n for n in graph['nodes']}
        targets=[nodes[e['target']] for e in graph['edges'] if e['type']=='imports' and nodes[e['source']].get('source',{}).get('path')=='pkg/a.py']
        self.assertEqual({n['source']['path'] for n in targets if n['type']=='File'},{'pkg/b.py'})
        unresolved=next(n for n in targets if n['type']=='Module')
        self.assertEqual(unresolved['properties']['resolution'],'ambiguous')
        self.assertEqual(unresolved['properties']['candidates'],['pkg/b.py','src/pkg/b.py'])
        self.assertTrue(any('ambiguous Python import pkg.b' in warning for warning in graph['warnings']))

    def test_python_library_harvest_pinned_target_prepare_and_import(self):
        session=self.runtime.dispatch(dict(op='start',goal='Reusable Python',allowEdits=True,allowCommands=True))['id']
        def call(tool,args,identity):return self.runtime.dispatch(dict(op='tool',session=session,tool=tool,args=args,callId=identity))
        self.assertTrue(call('write_script',dict(path='echo.py',content=SOURCE),'write')['ok'])
        result=call('run_script',dict(path='echo.py',command=sys.executable,args=['--input-json','{"message":"ok"}']),'run')
        self.assertEqual(result['result']['exitCode'],0,result)
        self.assertEqual(result['result']['reusableTool']['id'],'echo_json')
        recipe=self.runtime.dispatch(dict(op='tool_library',action='read',id='echo_json'))
        target=self.runtime.dispatch(dict(op='tool_library',action='target_save',id='check',tool='echo_json',arguments=dict(message='target'),expectedRevision=0))
        self.assertEqual(target['toolHash'],recipe['sha256'])
        prepared=call('python_tools',dict(action='prepare',target='check',expectedHash=recipe['sha256']),'prepare')
        self.assertTrue(prepared['ok'],prepared)
        run=call('run_script',dict(path=prepared['result']['path'],command=sys.executable,args=prepared['result']['args']),'execute')
        self.assertEqual(json.loads(run['result']['stdout']),dict(message='target'))
        bundle=self.runtime.dispatch(dict(op='tool_library',action='export'))
        with tempfile.TemporaryDirectory() as other:
            other_runtime=Runtime(other)
            try:
                result=other_runtime.dispatch(dict(op='tool_library',action='import',payload=bundle))
                self.assertFalse(result['executed']);self.assertEqual(result['imported'],1)
            finally:other_runtime.close()

    def test_mcp_rpc_and_real_shell_process(self):
        service=MCPService(self.runtime)
        transport=RPCTransport(service.frame)
        transport.request('initialize',dict(protocolVersion='2025-03-26'))
        self.assertTrue(transport.request('tools/list',{})['tools'])
        self.assertFalse(transport.request('tools/call',dict(name='project_graph',arguments=dict(action='export')))['isError'])
        response=transport.request('tools/call',dict(name='write_file',arguments=dict(path='denied.py',content='bad',expectedHash='missing')))
        self.assertTrue(response['isError']);self.assertFalse((self.root/'denied.py').exists())
        with ShellMCP(sys.executable,['-m','codingagentlib.rpc','--workspace',str(self.root)],cwd=str(Path(__file__).parent.parent)) as shell:
            result=shell.request('tools/call',dict(name='project_graph',arguments=dict(action='export')))
            self.assertFalse(result['isError'])
            self.assertEqual(result['structuredContent']['result']['format'],'codingagentlib/project-knowledge-v1')

    def test_duplicate_rpc_identity_does_not_replay_an_action(self):
        service=MCPService(self.runtime,allow_edits=True)
        service.frame(dict(jsonrpc='2.0',id=1,method='initialize',params=dict(protocolVersion='2025-03-26')))
        request=dict(jsonrpc='2.0',id=2,method='tools/call',params=dict(name='write_script',arguments=dict(path='guard.py',content='print("one")')))
        self.assertFalse(service.frame(request)['result']['isError'])
        request['params']['arguments']['content']='print("two")'
        self.assertIn('error',service.frame(request))
        self.assertEqual(service.calls,1)

    def test_self_modified_scripts_are_not_promoted_as_verified_recipes(self):
        session=self.runtime.dispatch(dict(op='start',goal='Check promotion',allowEdits=True,allowCommands=True))['id']
        source=SOURCE+'\nfrom pathlib import Path\np=Path(__file__)\np.write_text(p.read_text()+"\\n# changed\\n")\n'
        self.runtime.dispatch(dict(op='tool',session=session,tool='write_script',callId='write',args=dict(path='change.py',content=source)))
        result=self.runtime.dispatch(dict(op='tool',session=session,tool='run_script',callId='run',args=dict(path='change.py',command=sys.executable)))
        self.assertEqual(result['result']['exitCode'],0)
        self.assertNotIn('reusableTool',result['result'])
        self.assertEqual(self.runtime.dispatch(dict(op='tool_library',action='list'))['items'],[])
