import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from server import agent_acceptance
from server.agent_runtime import Runtime

class AcceptanceTests(unittest.TestCase):
    def test_shared_fixtures(self):
        cases=json.loads((Path(__file__).resolve().parent.parent/'shared-agent/acceptance-fixtures.json').read_text())
        for case in cases:
            with self.subTest(case=case['name']):self.assertEqual([r['status'] for r in agent_acceptance.evaluate(case['rules'],case['events'])['results']],case['expected'])
    def test_validation(self):
        rule={'id':'a','title':'A','tool':'read_file','checks':[{'path':'/text','op':'contains','value':'verified'}]}
        for rules in ({},[dict(rule,afterEdits=None)],[dict(rule,checks=[])],[rule,rule]):
            with self.assertRaises(ValueError):agent_acceptance.validate(rules)
    def test_runtime_enforcement_persistence_and_package(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'proof.txt').write_text('verified')
            runtime=Runtime(root,[])
            try:
                rules=[{'id':'proof','title':'Read verification artifact','tool':'read_file','match':[{'path':'/path','op':'equals','value':'proof.txt'}],'checks':[{'path':'/text','op':'contains','value':'verified'}]}]
                session=runtime.start({'goal':'Check artifact','tool':'codeiX','allowEdits':True,'acceptanceRules':rules});sid=session['id']
                def call(op,**data):return runtime.dispatch({'op':op,'session':sid,**data})
                with self.assertRaisesRegex(ValueError,'acceptance'):call('finish',outcome='complete',acceptance={'passed':True})
                self.assertFalse(call('acceptance_report')['report']['passed'])
                call('tool',tool='read_file',args={'path':'proof.txt'},callId='proof1');self.assertTrue(call('acceptance_report')['report']['passed'])
                call('tool',tool='write_file',args={'path':'new.txt','content':'changed','expectedHash':'missing'},callId='change');self.assertEqual(call('acceptance_report')['report']['results'][0]['status'],'stale')
                with self.assertRaisesRegex(ValueError,'acceptance'):call('finish',outcome='complete')
                runtime.close();runtime=Runtime(root,[]);self.assertEqual(runtime.get(sid)['acceptanceRules'],agent_acceptance.validate(rules));call('resume')
                call('tool',tool='read_file',args={'path':'proof.txt'},callId='proof2');finished=call('finish',summary='Observed artifact',outcome='complete');self.assertEqual(finished['status'],'complete')
                package=runtime.package(runtime.get(sid))
                with zipfile.ZipFile(package) as zip:
                    report=json.loads(zip.read('acceptance.json'));self.assertTrue(report['report']['passed']);self.assertEqual(report['report']['results'][0]['callId'],'proof2')
                other=runtime.start({'goal':'Blocked work','acceptanceRules':rules});self.assertEqual(runtime.dispatch({'op':'finish','session':other['id'],'outcome':'blocked'})['status'],'complete')
                with self.assertRaises(ValueError):runtime.start({'goal':'Typo','acceptanceRules':[dict(rules[0],tool='invented')]})
            finally:runtime.close()
