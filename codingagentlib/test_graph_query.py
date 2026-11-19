import json
from pathlib import Path
import unittest
import tempfile
from contextlib import closing
from . import Runtime
from .rpc import MCPService
from .python.mcp_transports import RPCTransport
from .python.extensions import mcp_tools
from .python.graph_query import query_graph

FIXTURES=json.loads((Path(__file__).parent/'conformance'/'graph-query-v1.json').read_text())


class GraphQueryTests(unittest.TestCase):
    def test_mcp_graph_schema_and_dispatch_support_explicit_empty_queries(self):
        with tempfile.TemporaryDirectory() as folder, closing(Runtime(folder)) as runtime:
            runtime.dispatch(dict(op='project_knowledge',project='flight',action='refresh'))
            transport=RPCTransport(MCPService(runtime).frame)
            transport.request('initialize',dict(protocolVersion='2025-03-26'))
            tool=next(t for t in mcp_tools(transport=transport,trust=lambda *args: True) if t['name']=='project_graph')
            self.assertEqual(tool['parameters']['properties']['fallback']['enum'],['inventory','empty'])
            result=tool['execute'](dict(project='flight',action='query',query='unmatched_xyz',fallback='empty'),{})
            self.assertEqual(result['structuredContent']['result']['nodes'],[])
            self.assertFalse(result['structuredContent']['result']['fallbackUsed'])

    def test_runtime_keeps_inventory_default_and_forwards_explicit_empty_mode(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder)/'über.py').write_text('class Überprüfung: pass\n')
            with closing(Runtime(folder)) as runtime:
                session=runtime.dispatch(dict(op='start',goal='Inspect source'))['id']
                runtime.dispatch(dict(op='project_knowledge',project='flight',action='refresh'))
                default=runtime.dispatch(dict(op='project_knowledge',project='flight',action='query',query='unmatched_xyz'))
                self.assertTrue(default['nodes']);self.assertTrue(default['fallbackUsed'])
                empty=runtime.dispatch(dict(op='project_knowledge',project='flight',action='query',query='unmatched_xyz',fallback='empty'))
                self.assertEqual(empty['nodes'],[]);self.assertFalse(empty['fallbackUsed'])
                tool=runtime.dispatch(dict(op='tool',session=session,tool='project_knowledge',callId='empty-query',args=dict(query='unmatched_xyz',fallback='empty')))
                self.assertTrue(tool['ok']);self.assertEqual(tool['result']['nodes'],[])
                unicode=runtime.dispatch(dict(op='project_knowledge',project='flight',action='query',query='Überprüfung',fallback='empty'))
                self.assertTrue(any(n['label']=='Überprüfung' for n in unicode['nodes']))

    def test_shared_conformance(self):
        for case in FIXTURES['cases']:
            options={('node_ids' if key=='nodeIds' else key):value for key,value in case['options'].items()}
            with self.subTest(name=case['name']):
                if not case['valid']:
                    with self.assertRaises(ValueError):query_graph(FIXTURES['graph'],**options)
                    continue
                result=query_graph(FIXTURES['graph'],**options)
                self.assertEqual([n['id'] for n in result['nodes']],case['expected']['nodes'])
                self.assertEqual([e['id'] for e in result['edges']],case['expected']['edges'])
                self.assertEqual(result['seeds'],case['expected']['seeds'])
                self.assertEqual(result['fallbackUsed'],case['expected']['fallbackUsed'])
                self.assertEqual(sorted(result['annotations']),sorted(case['expected']['annotations']))
                self.assertTrue(set(result['seeds']).issubset({n['id'] for n in result['nodes']}))

    def test_query_results_are_independent_snapshots(self):
        graph=json.loads(json.dumps(FIXTURES['graph']));seeds=['a']
        result=query_graph(graph,node_ids=seeds,hops=0)
        result['nodes'][0]['label']='Changed';result['annotations']['a']['text']='Changed'
        result['warnings'].append('Changed');result['seeds'].clear()
        self.assertEqual(seeds,['a']);self.assertEqual(graph['warnings'],['Reference data'])
        self.assertEqual(graph['annotations']['a']['text'],'prüfen')
        self.assertEqual(next(n for n in graph['nodes'] if n['id']=='a')['label'],'Überprüfung')
