import base64
import unittest
from .github_rst import scan


class GitHubRSTTests(unittest.TestCase):
    def fixture(self,truncated=False):
        commit='a'*40;tree='b'*40;blob='c'*40;calls=[]
        def request(path):
            calls.append(path)
            if path=='/repos/owner/docs':return dict(default_branch='main')
            if '/commits/' in path:return dict(sha=commit,commit=dict(tree=dict(sha=tree)))
            if path.endswith('?recursive=1'):return dict(truncated=truncated,tree=[] if truncated else [dict(path='guide.rst',type='blob',mode='100644',size=35,sha=blob)])
            if path.endswith('/git/trees/'+tree):return dict(truncated=False,tree=[dict(path='guide.rst',type='blob',mode='100644',size=35,sha=blob)])
            if path.endswith('/git/blobs/'+blob):return dict(encoding='base64',content=base64.b64encode(b'.. req:: Source\n   :id: REQ_SOURCE\n').decode())
            raise AssertionError(path)
        return request,calls

    def test_pins_commit_and_falls_back_for_truncated_recursive_tree(self):
        for truncated in (False,True):
            with self.subTest(truncated=truncated):
                request,calls=self.fixture(truncated)
                result=scan(dict(repositories=[dict(repository='owner/docs')]),request=request)
                self.assertTrue(result['complete']);self.assertEqual(result['documents'],1)
                self.assertEqual(result['repositories'][0]['commit'],'a'*40)
                self.assertIn('/repos/owner/docs/git/trees/'+'b'*40+'?recursive=1',calls)
                self.assertIn('REQ_SOURCE',result['repositories'][0]['files'][0]['content'])

    def test_rejects_arbitrary_hosts_tokens_duplicates_and_oversized_blobs(self):
        for data in (dict(repositories=[dict(repository='https://evil.example/org/repo')]),dict(repositories=[dict(repository='owner/docs')],token='bad\ntoken'),dict(repositories=[dict(repository='owner/docs'),dict(repository='OWNER/docs')])):
            request,_=self.fixture()
            with self.assertRaises(ValueError):scan(data,request=request)
        request,_=self.fixture()
        def oversized(path):
            value=request(path)
            if '/git/blobs/' in path:value['content']=base64.b64encode(b'x'*1000001).decode()
            return value
        with self.assertRaisesRegex(ValueError,'1 MB'):scan(dict(repositories=[dict(repository='owner/docs')]),request=oversized)

    def test_failed_second_repository_does_not_return_partial_import(self):
        request,_=self.fixture()
        def failing(path):
            if '/other/' in path:raise ValueError('Repository unavailable')
            return request(path)
        with self.assertRaisesRegex(ValueError,'unavailable'):scan(dict(repositories=[dict(repository='owner/docs'),dict(repository='other/docs')]),request=failing)
        request,calls=self.fixture()
        with self.assertRaisesRegex(ValueError,'cancelled'):scan(dict(repositories=[dict(repository='owner/docs')]),request=request,cancelled=lambda:len(calls)>0)
        self.assertEqual(len(calls),1)
