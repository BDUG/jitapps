import hashlib
from pathlib import Path
import tempfile
import unittest
from codingagentlib import Agent, Runtime
from codingagentlib.python import agent_instructions as I

class ProjectInstructionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.runtime = Runtime(self.root)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.runtime.close)
    def put(self, path, content):
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding='utf-8')
    def test_scoped_override_and_new_file_target(self):
        self.put('AGENTS.md','Root rules')
        self.put('src/AGENTS.md','Fallback rules')
        self.put('src/AGENTS.override.md','Nested override')
        self.put('other/AGENTS.md','Must not leak into src')
        result = I.read(self.runtime,'src/new/file.py')
        self.assertEqual([d['path'] for d in result['documents']],['AGENTS.md','src/AGENTS.override.md'])
        self.assertEqual([d['scope'] for d in result['documents']],['.','src'])
        self.assertEqual(result['documents'][1]['sha256'],hashlib.sha256(b'Nested override').hexdigest())
        self.put('src/AGENTS.override.md','  \n')
        self.assertEqual(I.read(self.runtime,'src')['documents'][-1]['content'],'Fallback rules')
    def test_budget_is_explicit_and_does_not_truncate_documents(self):
        self.put('AGENTS.md','🧪'*1000)
        self.put('src/AGENTS.md','x'*32768)
        result = I.read(self.runtime,'src')
        self.assertFalse(result['complete'])
        self.assertEqual(result['bytes'],4000)
        self.assertEqual(result['documents'][0]['content'],'🧪'*1000)
        self.assertEqual(result['warnings'][0]['reason'],'byte_budget')
    def test_invalid_targets_symlinks_and_private_configuration(self):
        for target in ['../escape','/tmp/outside','.suite-agent/x','.env/secret']:
            with self.assertRaises((ValueError,OSError)):I.read(self.runtime,target)
        outside = self.root.parent / (self.root.name+'-outside.txt')
        outside.write_text('outside marker')
        self.addCleanup(outside.unlink)
        (self.root/'AGENTS.md').symlink_to(outside)
        result=I.read(self.runtime)
        self.assertEqual(result['documents'],[])
        self.assertFalse(result['complete'])
        (self.root/'AGENTS.md').unlink()
        self.put('AGENTS.md','private marker')
        self.runtime.private_paths.add(self.root/'AGENTS.md')
        self.assertEqual(I.read(self.runtime)['documents'],[])
    def test_read_only_audited_tool(self):
        self.put('AGENTS.md','Run relevant tests')
        session=self.runtime.dispatch({'op':'start','tool':'headless','goal':'Inspect guidance','allowEdits':False,'allowCommands':False})
        result=self.runtime.dispatch({'op':'tool','session':session['id'],'tool':'read_project_instructions','args':{},'callId':'instructions-1'})
        self.assertTrue(result['ok'])
        self.assertEqual(result['result']['documents'][0]['content'],'Run relevant tests')
        saved=self.runtime.get(session['id'])
        self.assertFalse(saved['allowEdits'])
        self.assertFalse(saved['allowCommands'])
    def test_native_requests_refresh_root_and_recent_file_scope(self):
        self.put('AGENTS.md','Version one')
        self.put('src/source.py','print(1)')
        with Agent(self.root) as agent:
            session=agent.start('Read source')
            first=agent.next(session['id'])
            self.assertEqual(first['projectInstructions']['documents'][0]['content'],'Version one')
            agent.submit(session['id'],{'sessionId':session['id'],'step':first['step'],'status':'act','plan':'Inspect source','action':{'tool':'read_file','args':{'path':'src/source.py'}}})
            self.put('AGENTS.md','Version two')
            self.put('src/AGENTS.md','Use source-specific checks')
            second=agent.next(session['id'])
            self.assertEqual([d['content'] for d in second['projectInstructions']['documents']],['Version two','Use source-specific checks'])
