import sys
import tempfile
from pathlib import Path
import unittest
from server.agent_runtime import Runtime
from server import agent_planning

class PlanningTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'source.py').write_text('answer=42\n');self.runtime=Runtime(self.root,[sys.executable]);self.sid=self.runtime.start({'goal':'Inspect and verify','allowCommands':True})['id'];self.tasks=[{'id':'inspect','title':'Inspect','status':'in_progress'},{'id':'verify','title':'Verify','status':'pending','dependsOn':['inspect']}]
    def tearDown(self):self.runtime.close();self.temp.cleanup()
    def call(self,op,**data):return self.runtime.dispatch({'op':op,'session':self.sid,**data})
    def test_runtime_action_binding_and_manual_command(self):
        self.call('event',value={'status':'act','tasks':self.tasks})
        with self.assertRaisesRegex(ValueError,'taskId'):self.call('tool',tool='read_file',args={'path':'source.py'},callId='unbound')
        with self.assertRaisesRegex(ValueError,'taskId'):self.call('tool',tool='read_file',args={'path':'source.py'},callId='blocked',taskId='verify')
        value=self.call('tool',tool='read_file',args={'path':'source.py'},callId='read',taskId='inspect');self.assertTrue(value['ok'])
        self.assertEqual(self.runtime.get(self.sid)['events'][-2]['value']['taskId'],'inspect')
        done=[{**t,'status':'done'} for t in self.tasks];self.call('event',value={'status':'done','tasks':done})
        result=self.call('manual_command',args={'command':sys.executable,'args':['-c','print("manual")']});self.assertTrue(result['ok']);self.assertEqual(result['result']['exitCode'],0)
    def test_reject_invalid_graph_without_recording(self):
        for tasks in [[{**self.tasks[0],'dependsOn':['verify']},self.tasks[1]],[self.tasks[0],{**self.tasks[1],'status':'done'}],[{**self.tasks[0],'dependsOn':['missing']},self.tasks[1]]]:
            with self.assertRaises(ValueError):self.call('event',value={'tasks':tasks})
        self.assertEqual(self.runtime.get(self.sid)['events'],[])
