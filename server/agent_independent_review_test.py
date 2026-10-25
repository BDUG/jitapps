import tempfile
from pathlib import Path
import unittest
from server.agent_runtime import Runtime

class IndependentReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'source.py').write_text('answer = 42\n');self.runtime=Runtime(self.root,[]);self.session=self.runtime.start({'goal':'Inspect current source','independentReview':True});self.sid=self.session['id'];self.candidate={'summary':'Inspected source','verification':[],'outcome':'complete'}
    def tearDown(self):self.runtime.close();self.temp.cleanup()
    def call(self,op,**data):return self.runtime.dispatch({'op':op,'session':self.sid,**data})
    def approve(self):
        request=self.call('independent_prepare',candidate=self.candidate);result={'reviewId':request['reviewId'],'sessionId':self.sid,'verdict':'approve','summary':'Evidence is adequate.','findings':[]};self.call('independent_submit',reviewId=request['reviewId'],result=result);return request
    def test_required_fresh_approval_and_candidate(self):
        with self.assertRaisesRegex(ValueError,'must approve'):self.call('finish',**self.candidate)
        self.approve()
        with self.assertRaisesRegex(ValueError,'differs'):self.call('finish',**{**self.candidate,'summary':'Unreviewed claim'})
        result=self.call('finish',**self.candidate);self.assertEqual(result['status'],'complete');self.assertTrue(any(e['kind']=='independent_review' for e in result['events']))
    def test_external_write_invalidates_approval(self):
        self.approve();(self.root/'source.py').write_text('answer = 99\n')
        with self.assertRaisesRegex(ValueError,'stale'):self.call('finish',**self.candidate)
    def test_new_instruction_and_bad_verdict(self):
        request=self.call('independent_prepare',candidate=self.candidate)
        result={'reviewId':request['reviewId'],'sessionId':self.sid,'verdict':'approve','summary':'ok','findings':[{'severity':'error','message':'Missing behavior'}]}
        with self.assertRaisesRegex(ValueError,'error findings'):self.call('independent_submit',reviewId=request['reviewId'],result=result)
        self.call('event',value={'status':'follow_up','text':'Different requirement'})
        result['findings']=[]
        with self.assertRaisesRegex(ValueError,'changed during'):self.call('independent_submit',reviewId=request['reviewId'],result=result)
    def test_revision_and_partial_outcome(self):
        request=self.call('independent_prepare',candidate=self.candidate);result={'reviewId':request['reviewId'],'sessionId':self.sid,'verdict':'revise','summary':'No checks supplied','findings':[]};self.call('independent_submit',reviewId=request['reviewId'],result=result)
        with self.assertRaisesRegex(ValueError,'must approve'):self.call('finish',**self.candidate)
        self.assertEqual(self.call('finish',summary='Could not verify',outcome='partial')['status'],'complete')
