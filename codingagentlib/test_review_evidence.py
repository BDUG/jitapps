import tempfile
import unittest
from pathlib import Path
from codingagentlib import Runtime

class ReviewEvidenceTests(unittest.TestCase):
    def test_linked_findings_and_unknown_references(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'a.py').write_text('print(1)\n')
            runtime=Runtime(folder)
            session=runtime.dispatch({'op':'start','tool':'headless','goal':'Inspect source','allowEdits':True,'allowCommands':False})
            sid=session['id']
            runtime.dispatch({'op':'tool','session':sid,'tool':'read_file','args':{'path':'a.py'},'callId':'read1'})
            prepared=runtime.dispatch({'op':'independent_prepare','session':sid,'candidate':{'summary':'Reviewed','verification':[]}})
            self.assertTrue(any(e['id']=='call:read1' for e in prepared['evidenceIndex']))
            self.assertEqual(prepared['inspections'][0]['evidenceId'],'call:read1')
            finding={'severity':'error','message':'Investigate expected behavior','path':'a.py','line':1,'evidenceIds':['forged']}
            result={'reviewId':prepared['reviewId'],'sessionId':sid,'verdict':'revise','summary':'Needs work','findings':[finding]}
            prepared['evidenceIndex'].append({'id':'forged'}) # Caller mutation must not modify the checkpoint whitelist.
            with self.assertRaisesRegex(ValueError,'unknown evidence'):
                runtime.dispatch({'op':'independent_submit','session':sid,'reviewId':prepared['reviewId'],'result':result})
            finding['evidenceIds']=['call:read1']
            saved=runtime.dispatch({'op':'independent_submit','session':sid,'reviewId':prepared['reviewId'],'result':result})
            self.assertEqual(saved['findings'][0]['evidenceIds'],['call:read1'])
            self.assertFalse(any(e['id']=='forged' for e in saved['evidenceIndex']))
            self.assertEqual(runtime.dispatch({'op':'independent_submit','session':sid,'reviewId':prepared['reviewId'],'result':result}),saved)

    def test_legacy_findings_and_freshness(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Runtime(folder)
            session=runtime.dispatch({'op':'start','tool':'headless','goal':'Inspect','allowEdits':False,'allowCommands':False})
            sid=session['id']
            prepared=runtime.dispatch({'op':'independent_prepare','session':sid,'candidate':{'summary':'Reviewed','verification':[]}})
            result={'reviewId':prepared['reviewId'],'sessionId':sid,'verdict':'revise','summary':'Needs information','findings':[{'severity':'warning','message':'Legacy finding'}]}
            saved=runtime.dispatch({'op':'independent_submit','session':sid,'reviewId':prepared['reviewId'],'result':result})
            self.assertNotIn('evidenceIds',saved['findings'][0])
            runtime.dispatch({'op':'event','session':sid,'value':{'status':'follow_up','text':'Changed goal'}})
            with self.assertRaisesRegex(ValueError,'changed during independent review'):
                runtime.dispatch({'op':'independent_submit','session':sid,'reviewId':prepared['reviewId'],'result':result})
if __name__=='__main__':unittest.main()
