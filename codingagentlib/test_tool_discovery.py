import tempfile
import unittest
from codingagentlib import Runtime
from codingagentlib.python.agent_runtime import TOOLS
from codingagentlib.python.agent_tool_discovery import search

class DiscoveryTests(unittest.TestCase):
    def test_lookup_and_pages(self):
        result=search(TOOLS,{'names':['list_scripts','not_real']})
        self.assertEqual([t['name'] for t in result['tools']],['list_scripts'])
        self.assertEqual(result['unavailableNames'],['not_real'])
        result['tools'][0]['description']='Changed'
        self.assertNotEqual(next(t for t in TOOLS if t['name']=='list_scripts')['description'],'Changed')
        self.assertEqual(len(search(TOOLS,{'query':'workflow','limit':2})['tools']),2)
        self.assertFalse(search(TOOLS,{'limit':1})['done'])
        for args in [{'offset':False},{'limit':0},{'names':['x']*21},{'query':4}]:
            with self.assertRaises(ValueError):search(TOOLS,args)

    def test_audited_read_only_tool(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Runtime(folder)
            session=runtime.dispatch({'op':'start','tool':'headless','goal':'Inspect tools','allowEdits':False,'allowCommands':False})
            value=runtime.dispatch({'op':'tool','session':session['id'],'tool':'discover_tools','args':{'names':['list_scripts']},'callId':'discover'})
            self.assertTrue(value['ok'])
            self.assertEqual(value['result']['tools'][0]['name'],'list_scripts')
            saved=runtime.dispatch({'op':'session','session':session['id']})
            self.assertEqual(sum(e['kind']=='action' for e in saved['events']),1)
if __name__=='__main__':unittest.main()
