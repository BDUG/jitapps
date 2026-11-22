import concurrent.futures
import hashlib
from pathlib import Path
import tempfile
import unittest
from codingagentlib import Runtime
from codingagentlib.python.agent_edits import apply

class ApplyEditsTests(unittest.TestCase):
    def test_original_snapshot_semantics_unicode_and_line_endings(self):
        text='one two\r\n🧪 café\r\nuntouched\r\n'
        result,count=apply(text,[{'find':'one','replacement':'two'},{'find':'two','replacement':'three'},{'find':'🧪','replacement':'✓'}])
        self.assertEqual(result,'two three\r\n✓ café\r\nuntouched\r\n');self.assertEqual(count,3)
        self.assertEqual(apply('x x',[{'find':'x','replacement':'y','count':2}]),('y y',2))
    def test_ambiguous_overlapping_missing_invalid_and_oversized_edits(self):
        cases=[[],[{'find':'x','replacement':'y'}],[{'find':'one','replacement':'x'},{'find':'missing','replacement':'y'}],[{'find':'one two','replacement':'x'},{'find':'two','replacement':'y'}],[{'find':'one','replacement':'x','count':True}],[{'find':'','replacement':'x'}],[{'find':'one','replacement':'x','unexpected':1}],[{'find':'one','replacement':'x'*2_000_001}]]
        for edits in cases:
            with self.assertRaises(ValueError):apply('one two',edits)
        for count in [1,2]:
            with self.assertRaises(ValueError):apply('aaa',[{'find':'aa','replacement':'x','count':count}])
    def test_permission_hash_atomic_validation_and_recovery(self):
        root=self.enterContext(tempfile.TemporaryDirectory())
        path=Path(root,'source.txt');original=b'one two\r\nunchanged\r\n';path.write_bytes(original)
        runtime=Runtime(root);self.addCleanup(runtime.close)
        sid=runtime.dispatch({'op':'start','goal':'Edit','allowEdits':True})['id'];old=hashlib.sha256(original).hexdigest()
        def tool(call,edits,expected=old):return runtime.dispatch({'op':'tool','session':sid,'tool':'apply_edits','callId':call,'args':{'path':'source.txt','expectedHash':expected,'edits':edits}})
        dry=runtime.dispatch({'op':'tool','session':sid,'tool':'apply_edits','callId':'unsupported-preview','args':{'path':'source.txt','expectedHash':old,'edits':[{'find':'one','replacement':'bad'}],'dryRun':True}});self.assertFalse(dry['ok']);self.assertEqual(path.read_bytes(),original)
        bad=tool('bad',[{'find':'one','replacement':'ONE'},{'find':'missing','replacement':'bad'}]);self.assertFalse(bad['ok']);self.assertEqual(path.read_bytes(),original);self.assertEqual(runtime.get(sid)['backups'],{})
        result=tool('good',[{'find':'one','replacement':'two'},{'find':'two','replacement':'three'}]);self.assertTrue(result['ok']);self.assertEqual(result['result']['replacements'],2);self.assertEqual(path.read_bytes(),b'two three\r\nunchanged\r\n')
        stale=tool('stale',[{'find':'two','replacement':'lost'}]);self.assertEqual(stale['code'],'file_revision_conflict');self.assertEqual(path.read_bytes(),b'two three\r\nunchanged\r\n')
        restored=runtime.dispatch({'op':'tool','session':sid,'tool':'restore_file','callId':'restore','args':{'path':'source.txt','expectedHash':result['result']['hash']}});self.assertTrue(restored['ok']);self.assertEqual(path.read_bytes(),original)
        readonly=runtime.dispatch({'op':'start','goal':'Read only','allowEdits':False})['id']
        denied=runtime.dispatch({'op':'tool','session':readonly,'tool':'apply_edits','callId':'denied','args':{'path':'source.txt','expectedHash':old,'edits':[{'find':'one','replacement':'bad'}]}});self.assertFalse(denied['ok']);self.assertEqual(path.read_bytes(),original)
    def test_competing_batches_have_only_one_winner(self):
        root=self.enterContext(tempfile.TemporaryDirectory())
        path=Path(root,'source.txt');path.write_text('old');runtime=Runtime(root);self.addCleanup(runtime.close)
        sessions=[runtime.dispatch({'op':'start','goal':'Edit','allowEdits':True})['id'] for _ in range(2)]
        def edit(i):return runtime.dispatch({'op':'tool','session':sessions[i],'tool':'apply_edits','callId':'competing-'+str(i),'args':{'path':'source.txt','expectedHash':hashlib.sha256(b'old').hexdigest(),'edits':[{'find':'old','replacement':'writer'+str(i)}]}})
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(edit,range(2)))
        self.assertEqual(sum(r['ok'] for r in results),1);self.assertIn(path.read_text(),['writer0','writer1'])

    def test_apply_patch_discovery_image_git_and_interactive_process(self):
        import sys
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'src').mkdir()
            (root / 'src' / 'mod.py').write_text('def hello():\n    return "old"\n', encoding='utf-8')
            (root / 'drop.txt').write_text('remove me\n', encoding='utf-8')
            (root / 'dot.png').write_bytes(b'\x89PNG\r\n\x1a\n\x00\x00\x00\r')
            rt = Runtime(root, commands=[sys.executable])
            try:
                s = rt.dispatch({'op': 'start', 'goal': 'SDK parity', 'tool': 'test', 'allowEdits': True, 'allowCommands': True})
                sid = s['id']

                # find_files & grep_search
                found = rt.dispatch({'op': 'tool', 'session': sid, 'callId': 'ff', 'tool': 'find_files', 'args': {'pattern': '*.py', 'path': 'src'}})
                self.assertEqual(found['result']['files'], ['src/mod.py'])
                grep = rt.dispatch({'op': 'tool', 'session': sid, 'callId': 'gs', 'tool': 'grep_search', 'args': {'query': 'HELLO', 'caseSensitive': False, 'include': '*.py'}})
                self.assertEqual(grep['result']['total'], 1)

                # read_image
                img = rt.dispatch({'op': 'tool', 'session': sid, 'callId': 'img', 'tool': 'read_image', 'args': {'path': 'dot.png'}})
                self.assertEqual(img['result']['mimeType'], 'image/png')
                self.assertTrue(img['result']['dataUrl'].startswith('data:image/png;base64,'))

                # apply_patch (add + update + delete)
                patch = "\n".join([
                    "*** Begin Patch",
                    "*** Add File: src/added.txt",
                    "+created",
                    "*** Update File: src/mod.py",
                    "@@",
                    " def hello():",
                    '-    return "old"',
                    '+    return "new"',
                    "*** Delete File: drop.txt",
                    "*** End Patch",
                ])
                patched = rt.dispatch({'op': 'tool', 'session': sid, 'callId': 'ap', 'tool': 'apply_patch', 'args': {'patch': patch}})
                self.assertTrue(patched['ok'])
                self.assertEqual((root / 'src' / 'added.txt').read_text(encoding='utf-8'), 'created\n')
                self.assertIn('return "new"', (root / 'src' / 'mod.py').read_text(encoding='utf-8'))
                self.assertFalse((root / 'drop.txt').exists())

                # start_process + write_stdin + stop_process
                proc = rt.dispatch({'op': 'tool', 'session': sid, 'callId': 'sp', 'tool': 'start_process', 'args': {'command': sys.executable, 'args': ['-u', '-c', 'import sys; print("got:" + sys.stdin.readline().strip(), flush=True)']}})
                pid = proc['result']['processId']
                wr = rt.dispatch({'op': 'tool', 'session': sid, 'callId': 'ws', 'tool': 'write_stdin', 'args': {'processId': pid, 'input': 'ping\n', 'eof': True, 'waitMs': 2000}})
                self.assertIn('got:ping', wr['result']['stdout'])
                self.assertFalse(wr['result']['running'])
                self.assertEqual(wr['result']['exitCode'], 0)

                # web_fetch SSRF guard blocks http, localhost, and private IPs
                for idx, bad_url in enumerate((
                    'http://example.com',
                    'https://localhost/secret',
                    'https://127.0.0.1/admin',
                    'https://169.254.169.254/latest/meta-data',
                )):
                    wf = rt.dispatch({'op': 'tool', 'session': sid, 'callId': f'wf-{idx}', 'tool': 'web_fetch', 'args': {'url': bad_url}})
                    self.assertFalse(wf['ok'], f'Expected SSRF block for {bad_url}')
            finally:
                rt.close()
