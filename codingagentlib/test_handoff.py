import sys
import tempfile
import unittest
from codingagentlib import Agent, ModelHandoff

class HandoffTests(unittest.TestCase):
    def setUp(self):self.root=self.enterContext(tempfile.TemporaryDirectory());self.calls=[];self.probes=[]
    def detector(self,probe):
        self.probes.append(probe);proof=probe['brief']['evidence']
        return {'ready':True,'reason':'Implementation exercised; final validation remains','artifactCallId':proof['artifact']['callId'],'feedbackCallId':proof['feedback']['callId'],'remainingWork':[{'task':'Summarize actual checks','kind':'finalize'}]}
    def primary(self,r):
        self.calls.append('primary');step=r['step'];action={'tool':'write_file','args':{'path':'source.py','content':'value = 1\n','expectedHash':'missing'}} if step==1 else {'tool':'run_command','args':{'command':sys.executable,'args':['-c','from source import value; assert value == 1']}} if step==2 else None
        return {'sessionId':r['sessionId'],'step':step,'status':'act' if action else 'done','plan':'Implement and exercise source','action':action,'summary':'Verified source','outcome':'complete'}
    def continuation(self,r):
        self.calls.append('continuation');self.assertEqual(r['modelHandoff']['activeRole'],'continuation');self.assertIn('brief',r['modelHandoff'])
        return {'sessionId':r['sessionId'],'step':r['step'],'status':'ask','plan':'Continue from observed state','action':None,'question':'Any final adjustments?'}
    def test_auto_persists_and_resumes_without_repeating_detector(self):
        router=ModelHandoff(self.continuation,detector=self.detector,mode='auto')
        with Agent(self.root,[sys.executable]) as agent:
            result=agent.run('Implement value',self.primary,handoff=router,allow_edits=True,allow_commands=True);sid=result['sessionId']
            self.assertEqual(result['status'],'waiting');self.assertEqual(self.calls,['primary','primary','continuation']);self.assertEqual(len(self.probes),1)
        with Agent(self.root,[sys.executable]) as agent:
            result=agent.run('Implement value',self.primary,handoff=router,session_id=sid)
            self.assertEqual(result['status'],'waiting');self.assertEqual(self.calls[-1],'continuation');self.assertEqual(len(self.probes),1)
            events=agent.dispatch({'op':'session','session':sid})['events'];self.assertEqual(sum(e['value'].get('status')=='model_handoff' for e in events),1)
    def test_shadow_keeps_primary_and_invalid_evidence_never_switches(self):
        for mode,detector in [('shadow',self.detector),('auto',lambda p:{'ready':True,'reason':'Trust me','artifactCallId':'invented'})]:
            with tempfile.TemporaryDirectory() as root,Agent(root,[sys.executable]) as agent:
                result=agent.run('Implement value',self.primary,handoff=ModelHandoff(self.continuation,detector=detector,mode=mode),allow_edits=True,allow_commands=True)
                self.assertEqual(result['status'],'complete');self.assertNotIn('continuation',self.calls)
    def test_handoff_metadata_does_not_invalidate_reserved_turn(self):
        with Agent(self.root,[]) as agent:
            sid=agent.start('Read only')['id'];request=agent.next(sid)
            agent.dispatch({'op':'handoff_event','session':sid,'value':{'format':'codingagentlib/model-handoff/v1','status':'model_handoff_decision','ready':False}})
            result=agent.submit(sid,{'sessionId':sid,'step':request['step'],'status':'ask','plan':'Ask before changes','action':None,'question':'What next?'})
            self.assertEqual(result['status'],'waiting')
