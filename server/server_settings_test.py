import argparse
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from server.server_settings import Settings

class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        root=self.temp.name
        values=dict(bind='127.0.0.1',port=8000,config=root+'/providers.json',search_config=root+'/search.json',skills_db=None,skills_offline=True,allow_origin=[],allow_workflow_command=[],workflow_cwd=root,agent_workspace=root,disable_agent=False,agent_no_commands=False,agent_allow_command=None,agent_navigation_dir=None,agent_embedding_dir=None)
        self.server=SimpleNamespace(server_port=8000,allowed_origins=set(),agent_runtime=SimpleNamespace(root=Path(root),allowed={},sessions={}),workflow_commands=SimpleNamespace(active={}))
        self.settings=Settings(self.server,root+'/settings.json',argparse.Namespace(**values),[sys.executable])
    def review(self,**changes):
        proposal=self.settings.snapshot()['settings'];proposal.update(changes)
        return self.settings.dispatch(dict(action='review',revision=self.settings.revision,settings=proposal))
    def apply(self,review,**extras):
        return self.settings.dispatch(dict(action='apply',revision=review['revision'],ticket=review['ticket'],approved=True,**extras))
    def test_explicit_approval_and_exact_review(self):
        review=self.review(allow_origin=['https://example.org'])
        with self.assertRaises(ValueError):self.settings.dispatch(dict(action='apply',revision=1,ticket=review['ticket']))
        self.assertFalse(self.settings.path.exists())
        result=self.apply(review)
        self.assertEqual(self.server.allowed_origins,{'https://example.org'})
        self.assertEqual(result['revision'],2)
        self.assertEqual(self.settings.path.stat().st_mode & 0o777,0o600)
        with self.assertRaises(ValueError):self.apply(review)
    def test_restart_settings_do_not_change_running_listener(self):
        review=self.review(port=9001)
        result=self.apply(review)
        self.assertEqual(result['effective']['port'],8000)
        self.assertEqual(result['settings']['port'],9001)
        self.assertIn('port',result['restartRequired'])
        self.assertEqual(json.loads(self.settings.path.read_text())['port'],9001)
    def test_running_work_rejected_without_mutation(self):
        review=self.review(agent_no_commands=True)
        self.settings.active_requests=1
        with self.assertRaisesRegex(ValueError,'active'):self.apply(review)
        self.assertFalse(self.settings.path.exists())
        self.settings.active_requests=0
        self.server.agent_runtime.sessions={'x':{'status':'running'}}
        with self.assertRaisesRegex(ValueError,'active'):self.apply(review)
    def test_commands_can_be_disabled_and_restored(self):
        self.apply(self.review(agent_no_commands=True))
        self.assertEqual(self.server.agent_runtime.allowed,{})
        self.apply(self.review(agent_no_commands=False))
        self.assertIn(sys.executable,self.server.agent_runtime.allowed)
    def test_invalid_review_never_persists(self):
        with self.assertRaises(ValueError):self.review(allow_origin=['*'])
        with self.assertRaises(ValueError):self.review(agent_allow_command=['missing-command-xyz'])
        self.assertFalse(self.settings.path.exists())
    def test_failure_to_persist_preserves_live_config(self):
        self.settings.path=Path(self.temp.name)/'missing'/'settings.json'
        self.settings.path.parent.write_text('not a directory')
        review=self.review(allow_origin=['https://example.org'])
        with self.assertRaises(OSError):self.apply(review)
        self.assertEqual(self.server.allowed_origins,set())
    def test_expired_review_is_rejected(self):
        review=self.review(port=9001)
        self.settings.reviews[review['ticket']]=(0,1,{})
        with self.assertRaisesRegex(ValueError,'expired'):self.apply(review)
        self.assertFalse(self.settings.path.exists())
    def test_apply_cannot_replace_reviewed_proposal(self):
        review=self.review(allow_origin=['https://example.org'])
        self.apply(review,settings={'allow_origin':['https://other.example']})
        self.assertEqual(self.server.allowed_origins,{'https://example.org'})
    def test_new_review_invalidates_previous_ticket(self):
        old=self.review(port=9001);self.review(port=9002)
        with self.assertRaisesRegex(ValueError,'expired'):self.apply(old)

    def test_all_commands_can_be_reviewed_applied_and_disabled(self):
        reviewed=self.review(agent_allow_command=['*']);self.apply(reviewed)
        self.assertIn('*',self.server.agent_runtime.allowed)
        reviewed=self.review(agent_no_commands=True);self.apply(reviewed)
        self.assertEqual(self.server.agent_runtime.allowed,{})
        reviewed=self.review(agent_no_commands=False,agent_allow_command=[sys.executable]);self.apply(reviewed)
        self.assertNotIn('*',self.server.agent_runtime.allowed)
        self.assertIn(sys.executable,self.server.agent_runtime.allowed)

if __name__=='__main__':unittest.main()
