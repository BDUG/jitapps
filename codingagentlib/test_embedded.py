import threading
import unittest
from codingagentlib import EmbeddedAgent

def response(r,status,**extra):return {'sessionId':r['sessionId'],'step':r['step'],'status':status,'plan':'Public integration plan','action':None,**extra}
class EmbeddedTests(unittest.TestCase):
    def test_tools_permissions_resume_and_events(self):
        calls=[];events=[]
        a=EmbeddedAgent(on_event=lambda e:events.append(e['kind'])).add_tool('write',lambda args,ctx:calls.append(args),permission='edits')
        def model(r):
            r['permissions']['edits']=True
            return response(r,'act',action={'tool':'write','args':{}})
        result=a.run('Inspect',model,max_steps=1)
        self.assertEqual(result['reason'],'step_budget');self.assertEqual(calls,[]);self.assertIn('observation',events)
        self.assertEqual(a.resume('Continue',lambda r:response(r,'ask',question='Which file?'))['status'],'waiting')
        self.assertEqual(a.resume('hello.txt',lambda r:response(r,'done',summary='Complete'))['status'],'complete')
    def test_approval_cancellation_and_repairs(self):
        calls=[];a=EmbeddedAgent(before_tool=lambda tool,args:False).add_tool('echo',lambda args,ctx:calls.append(args))
        a.run('Inspect',lambda r:response(r,'act',action={'tool':'echo','args':{}}),max_steps=1);self.assertEqual(calls,[])
        self.assertEqual(a.run('Repair',lambda r:None)['status'],'waiting');self.assertEqual(len([e for e in a.snapshot()['events'] if e['kind']=='feedback']),3)
        stop=threading.Event()
        def model(r):stop.set();return response(r,'act',action={'tool':'echo','args':{}})
        self.assertEqual(a.run('Cancel',model,cancel_event=stop)['reason'],'cancelled');self.assertEqual(calls,[])
    def test_tool_context_and_hook_failures(self):
        a=EmbeddedAgent().add_tool('echo',lambda args,ctx:{'text':args['text'],'callId':ctx['callId']})
        a.run('Echo',lambda r:response(r,'act',action={'tool':'echo','args':{'text':'hello'}}),max_steps=1)
        self.assertIn('callId',a.snapshot()['events'][-1]['value']['result'])
        with self.assertRaises(ValueError):a.add_tool('echo',lambda a,c:None)
        def fail(event):raise RuntimeError('observer')
        a.on_event=fail
        with self.assertRaises(RuntimeError):a.run('Observe',lambda r:response(r,'done',summary='Complete'))
        self.assertEqual(a.snapshot()['status'],'paused')

class EmbeddedExtensionsTests(unittest.TestCase):
    def test_tool_management_completion_gate_and_restore(self):
        a=EmbeddedAgent(before_finish=lambda r,s:any(e['kind']=='observation' and e['value']['ok'] for e in s['events'])).add_tool('echo',lambda args,ctx:args)
        a.set_tool_enabled('echo',False);self.assertFalse(a.list_tools()[0]['enabled']);a.set_tool_enabled('echo',True)
        self.assertEqual(a.run('Verify',lambda r:response(r,'done',summary='Unverified'))['status'],'waiting')
        paused=a.resume('Use echo',lambda r:response(r,'act',action={'tool':'echo','args':{'value':'hello'}}),max_steps=1)
        self.assertEqual(paused['metrics']['toolAttempts'],1)
        snapshot=a.snapshot();snapshot['permissions']['edits']=True
        b=EmbeddedAgent().add_tool('echo',lambda args,ctx:args).restore(snapshot)
        self.assertFalse(b.snapshot()['permissions']['edits']);b.set_context({'phase':'restored'})
        self.assertEqual(b.resume('Continue',lambda r:response(r,'done',summary=r['context']['phase']))['summary'],'restored')
        with self.assertRaises(ValueError):b.restore({**snapshot,'events':[{'kind':'observation','value':None}]})
        b.remove_tool('echo');self.assertEqual(b.list_tools(),[])
