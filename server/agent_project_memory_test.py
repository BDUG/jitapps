import tempfile
import unittest
from pathlib import Path
from codingagentlib.python.agent_runtime import Runtime

class ProjectMemoryTest(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.addCleanup(self.folder.cleanup)
        self.runtime=Runtime(Path(self.folder.name));self.p='codeiX: Product A'
    def call(self,action,project=None,**args):
        return self.runtime.dispatch({'op':'project_memory','project':project or self.p,'action':action,**args})
    def save(self,**args):
        return self.call('save',title='API decision',text='Use pagination for the customer endpoint',category='decision',source='ADR-001',**args)
    def test_scopes_persistence_and_session_separation(self):
        note=self.save(pinned=True)
        self.assertEqual(self.call('list')['total'],1)
        self.assertEqual(self.call('list',project='Other')['total'],0)
        self.assertEqual(self.runtime.memory.list('project:'+self.p)['total'],0)
        restarted=Runtime(Path(self.folder.name))
        self.assertEqual(restarted.dispatch({'op':'project_memory','project':self.p,'action':'read','id':note['id']})['text'],'Use pagination for the customer endpoint')
        with self.assertRaises(ValueError):self.call('read',project='Other',id=note['id'])
    def test_revision_conflicts_and_delete(self):
        note=self.save();updated=self.call('save',id=note['id'],expectedRevision=note['revision'],title='Changed',text='New requirement',category='constraint')
        with self.assertRaisesRegex(ValueError,'changed'):self.call('delete',id=note['id'],expectedRevision=note['revision'])
        with self.assertRaisesRegex(ValueError,'changed'):self.save(id=note['id'],expectedRevision=note['revision'])
        self.assertEqual(self.call('read',id=note['id'])['text'],'New requirement')
        self.call('delete',id=note['id'],expectedRevision=updated['revision']);self.assertEqual(self.call('list')['total'],0)
    def test_recall_archival_expiry_bounds_and_full_text(self):
        visible=self.save(pinned=True)
        self.save(archived=True);self.save(expires='2000-01-01');long=self.call('save',title='Long',text='pagination '+('exact evidence 🧪 '*500),category='lesson')
        result=self.call('search',query='pagination OR " - invalid : *')
        self.assertEqual({m['id'] for m in result['matches']},{visible['id'],long['id']})
        self.assertTrue(next(m for m in result['matches'] if m['id']==long['id'])['truncated'])
        self.assertGreater(len(self.call('read',id=long['id'])['text']),1600)
        self.assertEqual(self.call('list')['total'],4)
        self.assertNotIn('text',self.call('list')['notes'][0])
        with self.assertRaises(ValueError):self.call('save',title='x',text='x'*100001,category='note')
    def test_paging_empty_queries_and_atomic_update_index(self):
        for i in range(7):self.call('save',title='Note '+str(i),text='alpha data',category='note')
        first=self.call('list',limit=3);second=self.call('list',limit=3,cursor=first['nextCursor'])
        self.assertFalse({n['id'] for n in first['notes']}&{n['id'] for n in second['notes']})
        self.assertEqual(self.call('search',query='')['matches'],[])
        note=first['notes'][0];self.call('save',id=note['id'],expectedRevision=note['revision'],title='Updated',text='quartz unique term',category='note')
        self.assertEqual(len(self.call('search',query='quartz')['matches']),1)
        self.call('delete',id=note['id'],expectedRevision=self.call('read',id=note['id'])['revision'])
        self.assertEqual(self.call('search',query='quartz')['matches'],[])
    def test_bound_tool_read_pages_and_rejects_other_projects(self):
        note=self.call('save',title='Full evidence',text='Unicode 🧪 evidence '*300,category='constraint')
        started=self.runtime.start({'goal':'Inspect notes','projectMemoryProject':self.p})
        session=self.runtime.get(started['id'])
        page=self.runtime.execute(session,'read_project_memory',{'id':note['id'],'offset':10,'limit':35})
        self.assertEqual(page['text'],('Unicode 🧪 evidence '*300)[10:45])
        self.assertEqual(page['nextOffset'],45)
        self.assertFalse(page['done'])
        other=self.call('save',project='Other',title='Private project note',text='Other data',category='note')
        with self.assertRaises(ValueError):self.runtime.execute(session,'read_project_memory',{'id':other['id']})
        unbound=self.runtime.get(self.runtime.start({'goal':'No recall'})['id'])
        with self.assertRaises(PermissionError):self.runtime.execute(unbound,'read_project_memory',{'id':note['id']})
if __name__=='__main__':unittest.main()
