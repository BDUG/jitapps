import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from server.skill_catalog import Catalog, APPS, allowed_url, records
from server.skill_api import augment

class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'catalog.sqlite3';self.catalog=Catalog(self.path,offline=True)
    def tearDown(self):self.catalog.close();self.tmp.cleanup()
    def test_seed_and_defaults(self):
        status=self.catalog.status();self.assertEqual(status['counts']['skill'],78);self.assertGreater(status['counts']['reference'],500);self.assertEqual(len(status['sources']),5)
        for app in APPS:
            profile=self.catalog.profile(app);self.assertGreaterEqual(len(profile['selected']),4)
            context=self.catalog.context(app,'Improve this document');self.assertTrue(context['skills']);self.assertTrue(all(x['kind']=='skill' for x in context['skills']))
    def test_title_matches_are_ranked_above_collisions(self):
        self.assertEqual(self.catalog.search('domain modeling',kind='skill')['items'][0]['name'],'domain-modeling')
    def test_profile_cas_disable_and_reload(self):
        profile=self.catalog.profile('codeiX');profile['enabled']=False;self.catalog.save_profile('codeiX',profile)
        with self.assertRaises(ValueError):self.catalog.save_profile('codeiX',profile)
        reloaded=Catalog(self.path,offline=True);self.assertFalse(reloaded.context('codeiX','test')['enabled']);self.assertTrue(reloaded.profile('architex')['enabled']);reloaded.close()
    def test_read_pinning_and_pagination(self):
        id=self.catalog.profile('architex')['selected'][0];first=self.catalog.read(id,limit=30);second=self.catalog.read(id,first['nextOffset'],30,first['contentHash']);self.assertGreater(second['nextOffset'],first['nextOffset'])
        with self.assertRaises(ValueError):self.catalog.read(id,content_hash='stale')
    def test_relay_preserves_contract_and_isolates_data(self):
        messages=[{'role':'system','content':'fixed schema'},{'role':'user','content':json.dumps({'task':'Fix the API','tool':'appiX','requestId':'keep'})}]
        updated,context=augment(self.catalog,{},messages);self.assertEqual(updated[0],messages[0]);self.assertEqual(updated[-1],messages[-1]);self.assertIn('retrievedSkillContext',updated[-2]['content']);self.assertEqual(context['app'],'appiX');self.assertEqual(len(messages),2)
        profile=self.catalog.profile('appiX');profile['enabled']=False;self.catalog.save_profile('appiX',profile);self.assertEqual(augment(self.catalog,{'app':'appiX'},messages)[0],messages)
    def test_directory_is_not_executable_skill(self):
        result=self.catalog.search('browser',kind='reference');self.assertTrue(result['items']);id=result['items'][0]['id']
        with self.assertRaises(ValueError):self.catalog.resolve(id)
        self.assertEqual(self.catalog.read(id)['kind'],'reference')
    def test_failed_refresh_keeps_cached_skills(self):
        with patch('server.skill_catalog.fetch',side_effect=OSError('offline')):self.catalog.refresh()
        self.assertEqual(self.catalog.status()['counts']['skill'],78);self.assertTrue(all(x['state']=='unavailable' for x in self.catalog.status()['sources']))
    def test_reference_resolution_and_refresh_preserve_cached_body(self):
        self.catalog.offline=False
        id=next(x['id'] for x in self.catalog.seed['documents'] if x['name']=='anthropics/xlsx')
        with patch('server.skill_catalog.fetch',return_value=b'---\nname: xlsx\n---\n# Spreadsheet procedure'):
            read=self.catalog.resolve(id)
        self.assertEqual(read['kind'],'skill');self.assertIn('Spreadsheet procedure',read['text'])
        source=self.catalog.sources['voltagent'];docs=[d for d in self.catalog.seed['documents'] if d['source']=='voltagent']
        self.catalog.replace_source(source,docs,{'state':'ready'})
        self.assertEqual(self.catalog.read(id)['contentHash'],read['contentHash'])
        with patch('server.skill_catalog.fetch',return_value=b'# Updated spreadsheet procedure'):
            updated=self.catalog.resolve(id,force=True)
        self.assertNotEqual(updated['contentHash'],read['contentHash'])
        with self.assertRaises(ValueError):self.catalog.read(id,content_hash=read['contentHash'])
    def test_linkly_index_is_discovery_not_an_executable_skill(self):
        docs=records({'id':'linkly','url':'https://linkly.ai/skills/llms.txt'},{'llms.txt':'[Research](https://linkly.ai/skills/research.md)'},'test-revision')
        self.assertEqual(len(docs),2);self.assertTrue(all(d['kind']=='reference' for d in docs))
    def test_profile_history_restore_and_app_isolation(self):
        one=self.catalog.save_profile('architex',self.catalog.profile('architex'))
        two=self.catalog.save_profile('architex',{**one,'enabled':False})
        page=self.catalog.history('architex',limit=1)
        self.assertEqual(page['items'][0]['revision'],2);self.assertFalse(page['done'])
        older=self.catalog.history('architex',cursor=page['nextCursor'])['items'][0]
        restored=self.catalog.save_profile('architex',{**older,'revision':two['revision']})
        self.assertEqual(restored['revision'],3);self.assertTrue(restored['enabled'])
        self.assertEqual([x['revision'] for x in self.catalog.history('architex')['items']],[3,2,1])
        self.assertEqual(self.catalog.history('codeiX')['items'],[])
    def test_source_filter_and_targeted_refresh(self):
        self.assertTrue(all(x['source']=='addy' for x in self.catalog.search(source='addy')['items']))
        with self.assertRaises(ValueError):self.catalog.search(source='unknown')
        with patch('server.skill_catalog.fetch',return_value=b'[Research](https://linkly.ai/skills/research.md)') as fetch:
            self.catalog.refresh('linkly')
        self.assertEqual(fetch.call_count,1)
        states={x['id']:x['state'] for x in self.catalog.status()['sources']}
        self.assertEqual(states['linkly'],'ready');self.assertEqual(states['addy'],'seeded')
        with self.assertRaises(ValueError):self.catalog.refresh('unknown')
    def test_app_skill_edits_custom_skills_and_history(self):
        profile=self.catalog.profile('codeiX');id=profile['selected'][0];original=self.catalog.read(id)
        profile['overrides']={id:{'name':'Edited verification','description':'Reusable regression procedure','content':'# Verification\nVerify quasar pipelines with a regression test.'},'custom:quasar':{'name':'Quasar workflow','description':'Quasar review checklist','content':'# Quasar\nInspect quasar dependencies and verify results.'}}
        profile['selected'].append('custom:quasar');saved=self.catalog.save_profile('codeiX',profile)
        edited=self.catalog.read(id,app='codeiX');self.assertEqual(edited['name'],'Edited verification');self.assertNotEqual(edited['contentHash'],original['contentHash']);self.assertEqual(self.catalog.read(id)['text'],original['text']);self.assertEqual(self.catalog.read(id,app='architex')['text'],original['text'])
        context=self.catalog.context('codeiX','quasar');self.assertTrue(any(d['id']=='custom:quasar' for d in context['skills']));self.assertTrue(any('Verify quasar' in d['excerpt'] for d in context['skills']))
        messages=[{'role':'system','content':'Keep the response schema'},{'role':'user','content':'Quasar workflow'}];updated,injected=augment(self.catalog,{'app':'codeiX'},messages);self.assertTrue(any(d['id']=='custom:quasar' for d in injected['skills']));self.assertIn('Inspect quasar',updated[-2]['content']);self.assertEqual(updated[-1],messages[-1])
        with self.assertRaises(ValueError):self.catalog.read(id,app='codeiX',content_hash=original['contentHash'])
        self.assertEqual(self.catalog.read('custom:quasar',app='codeiX')['source'],'app-local')
        with self.assertRaises(ValueError):self.catalog.read('custom:quasar',app='textiX')
        copied=self.catalog.save_profile('textiX',{**saved,'revision':0});self.assertEqual(copied['overrides'],saved['overrides'])
        reverted=self.catalog.save_profile('codeiX',{**saved,'overrides':{},'selected':[id]});self.assertEqual(self.catalog.read(id,app='codeiX')['text'],original['text']);self.assertEqual(self.catalog.history('codeiX')['items'][1]['overrides'],saved['overrides'])
        restored=self.catalog.save_profile('codeiX',{**saved,'revision':reverted['revision']});self.assertEqual(self.catalog.context('codeiX','quasar')['profileRevision'],restored['revision'])
    def test_per_skill_activation_order_and_round_trip(self):
        profile=self.catalog.profile('codeiX');one='custom:first';two='custom:second';edit={'name':'Identical priority','description':'Quasar ordering','content':'# Quasar ordering\nInspect the quasar implementation.'}
        profile.update(selected=[two,one],overrides={one:edit,two:edit},disabled=[two],guidance='quasar',topK=2)
        saved=self.catalog.save_profile('codeiX',profile);self.assertEqual([x['id'] for x in self.catalog.context('codeiX','quasar')['skills']],[one])
        saved=self.catalog.save_profile('codeiX',{**saved,'disabled':[]});self.assertEqual([x['id'] for x in self.catalog.context('codeiX','quasar')['skills']],[two,one])
        saved=self.catalog.save_profile('codeiX',{**saved,'disabled':[one,two]});self.assertEqual(self.catalog.context('codeiX','quasar')['skills'],[]);self.assertEqual(self.catalog.context('codeiX','quasar')['missingOrReferenceIds'],[])
        self.assertEqual(self.catalog.history('codeiX')['items'][0]['disabled'],[one,two])
        for invalid in [['unknown'],[one,one],'not-a-list']:
            with self.assertRaises(ValueError):self.catalog.save_profile('codeiX',{**saved,'disabled':invalid})

    def test_skill_edit_validation(self):
        profile=self.catalog.profile('codeiX');id=profile['selected'][0]
        for edits in [[],{id:{}},{'not-selected':{'name':'Bad','description':'','content':'x'}},{id:{'name':'x','description':'','content':''}},{id:{'name':'x','description':'','content':'x'*100001}}]:
            with self.assertRaises(ValueError):self.catalog.save_profile('codeiX',{**profile,'overrides':edits})
        with self.assertRaises(ValueError):self.catalog.save_profile('codeiX',{**profile,'selected':['fake:custom'],'overrides':{'fake:custom':{'name':'x','description':'','content':'x'}}})

    def test_ssrf_and_invalid_inputs(self):
        for url in ['http://github.com/x','https://localhost/x','https://github.com@127.0.0.1/x','https://github.com:123/x','file:///etc/passwd']:
            with self.assertRaises(ValueError):allowed_url(url)
        with self.assertRaises(ValueError):self.catalog.profile('unknown')
        profile=self.catalog.profile('architex');profile['selected']=['not-real']
        with self.assertRaises(ValueError):self.catalog.save_profile('architex',profile)

if __name__=='__main__':unittest.main()
