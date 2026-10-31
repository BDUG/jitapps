import json
from pathlib import Path
import tempfile
import unittest
from server import relay_config as C
from server.agent_runtime import Runtime

class CollaborationTests(unittest.TestCase):
    def config(self):
        profiles=[]
        for identity in ['lead','solver','critic']:
            profile=C.preset('openai');profile.update(id=identity,name=identity,apiKey='private-'+identity);profiles.append(profile)
        return dict(format='architex-relay-providers',version=1,activeProfileId='lead',profiles=profiles,allowedOrigins=[],agentCollaboration={'mode':'adaptive','members':[{'profileId':'solver','role':'solver'},{'profileId':'critic','role':'critic'}],'maxConsultations':2,'interval':5})
    def test_validation_roundtrip_and_public_roles(self):
        with tempfile.TemporaryDirectory() as root:
            store=C.Store(Path(root)/'providers.json');store.save(self.config());roles=store.collaboration()
            self.assertEqual(roles['members'][1]['role'],'critic');self.assertNotIn('private-',json.dumps(roles));self.assertNotIn('private-',json.dumps(store.snapshot()))
            restored=C.Store(store.path);self.assertEqual(restored.collaboration(),roles)
            changed=store.snapshot(secrets=True);changed['profiles'][1]['model']='different';store.save(changed)
            self.assertNotEqual(store.collaboration()['members'][0]['id'],roles['members'][0]['id'])
            old=self.config();old.pop('agentCollaboration');self.assertEqual(C.normalize(old)['agentCollaboration']['mode'],'off')
        for update in [{'mode':'bad'},{'maxConsultations':0},{'maxConsultations':True},{'interval':0},{'members':[{'profileId':'missing','role':'solver'}]},{'members':[{'profileId':'solver','role':'tool'}]}]:
            wrong=self.config();wrong['agentCollaboration'].update(update)
            with self.assertRaises(ValueError):C.normalize(wrong)
    def test_metadata_keeps_reserved_turn_and_cannot_be_tool_evidence(self):
        with tempfile.TemporaryDirectory() as root:
            runtime=Runtime(Path(root),[])
            try:
                session=runtime.start({'goal':'Plan','allowCommands':False});sid=session['id']
                turn=runtime.dispatch({'op':'turn','session':sid})
                event=runtime.dispatch({'op':'collaboration_event','session':sid,'value':{'format':'codingagentlib/model-collaboration/v1','status':'model_collaboration_round','text':'Advisory only','discussion':[]}})
                self.assertEqual(event['kind'],'user');self.assertEqual([e['value']['step'] for e in runtime.get(sid)['events'] if e['kind']=='turn'],[turn['step']])
                self.assertFalse(any(e['kind']=='observation' for e in runtime.get(sid)['events']))
                with self.assertRaises(ValueError):runtime.dispatch({'op':'collaboration_event','session':sid,'value':{'format':'codingagentlib/model-collaboration/v1','status':'act'}})
            finally:runtime.close()
