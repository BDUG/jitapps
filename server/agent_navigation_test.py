import shutil
import os
from unittest.mock import patch
from codingagentlib.python.agent_navigation import PythonIndex, MAX_FILE_BYTES
import tempfile
from pathlib import Path
import unittest
from server.agent_runtime import Runtime
from server.agent_navigation import Navigation

class NavigationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.runtime=Runtime(self.root,[]);self.nav=Navigation()
    def tearDown(self):self.runtime.close();self.temp.cleanup()
    def write(self,path,text):target=self.root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
    def test_python_snapshot_reuse_and_content_invalidation(self):
        self.write('lib.py','def first(): pass\n')
        with patch('codingagentlib.python.agent_navigation.PythonIndex',wraps=PythonIndex) as build:
            first=self.nav.run(self.runtime,'symbols',{'query':'first'})
            first['results'][0]['name']='mutated response'
            again=self.nav.run(self.runtime,'symbols',{'query':'first'})
            self.assertEqual(again['results'][0]['name'],'first')
            self.assertEqual(build.call_count,1)
            before=(self.root/'lib.py').stat()
            self.write('lib.py','def other(): pass\n')
            os.utime(self.root/'lib.py',ns=(before.st_atime_ns,before.st_mtime_ns))
            changed=self.nav.run(self.runtime,'symbols',{'query':'other'})
            self.assertEqual(changed['results'][0]['name'],'other')
            self.assertEqual(build.call_count,2)
            self.write('added.py','def added(): pass\n')
            self.assertEqual(self.nav.run(self.runtime,'symbols',{'query':'added'})['total'],1)
            self.assertEqual(build.call_count,3)
            (self.root/'added.py').unlink()
            self.assertEqual(self.nav.run(self.runtime,'symbols',{'query':'added'})['total'],0)
            self.assertEqual(build.call_count,4)

    def test_javascript_requests_do_not_build_python_index(self):
        self.write('lib.py','def unused(): pass\n')
        self.write('main.js','const value = 1;\n')
        with patch('codingagentlib.python.agent_navigation.PythonIndex') as build,patch.object(self.nav,'health',return_value={'javascriptTypescript':'unavailable'}):
            with self.assertRaisesRegex(ValueError,'Install the TypeScript'):
                self.nav.run(self.runtime,'diagnostics',{'path':'main.js'})
            build.assert_not_called()

    def test_one_megabyte_source_is_indexed_and_larger_file_disclosed(self):
        prefix='def large_symbol():\n    return 1\n#'
        self.write('boundary.py',prefix+'x'*(MAX_FILE_BYTES-len(prefix.encode())))
        self.write('too-large.py',prefix+'x'*(MAX_FILE_BYTES+1-len(prefix.encode())))
        self.assertEqual(self.nav.health()['limits']['fileBytes'],1000000)
        result=self.nav.run(self.runtime,'symbols',{'query':'large_symbol'})
        self.assertEqual([r['path'] for r in result['results']],['boundary.py'])
        self.assertEqual(result['coverage']['indexedFiles'],1);self.assertEqual(result['coverage']['skippedFiles'],1);self.assertFalse(result['coverage']['complete'])

    def test_one_megabyte_javascript_uses_the_server_navigation_service(self):
        navigation=Navigation(Path(__file__).parent/'code-navigation')
        if navigation.health()['javascriptTypescript']!='typescript-language-service':self.skipTest('Install server/code-navigation dependencies')
        prefix='export function largeSource(value) { return value + 1; }\n//'
        self.write('large.js',prefix+'x'*(MAX_FILE_BYTES-len(prefix.encode())))
        result=navigation.run(self.runtime,'symbols',{'path':'large.js','query':'largeSource'})
        self.assertTrue(any(item['name']=='largeSource' for item in result['results']))
        self.assertIn('typescript-language-service',result['engines']);self.assertEqual(result['coverage']['bytes'],MAX_FILE_BYTES);self.assertEqual(result['coverage']['skippedFiles'],0)

    def test_python_imports_shadowing_and_syntax(self):
        self.write('lib.py','def add(a, b):\n    return a + b\n')
        self.write('main.py','from lib import add as total\nx = total(2, 3)\ndef other(total):\n    return total\n')
        found=self.nav.run(self.runtime,'definition',{'path':'main.py','line':2,'column':5})['results'];self.assertEqual(found[0]['path'],'lib.py');self.assertEqual(found[0]['name'],'add')
        refs=self.nav.run(self.runtime,'references',{'path':'lib.py','line':1,'column':5})['results'];self.assertTrue(any(r['path']=='main.py' and r['line']==2 for r in refs));self.assertFalse(any(r['path']=='main.py' and r['line']==4 for r in refs))
        first=found[0]['hash'];self.write('lib.py','def add(a, b):\n    return a - b\n');self.assertNotEqual(first,self.nav.run(self.runtime,'definition',{'path':'main.py','line':2,'column':5})['results'][0]['hash'])
        self.write('broken.py','def nope(:\n');self.assertEqual(self.nav.run(self.runtime,'diagnostics',{'path':'broken.py'})['results'][0]['code'],'python-syntax')
        self.write('.suite-agent/hidden.py','def hidden(): pass');self.assertFalse(any('.suite-agent' in r['path'] for r in self.nav.run(self.runtime,'symbols',{})['results']))
        with self.assertRaises(ValueError):self.nav.run(self.runtime,'symbols',{'path':'../escape'})
    def test_javascript_commonjs_bindings(self):
        if self.nav.health()['javascriptTypescript']!='typescript-language-service':self.skipTest('Install navigation npm dependencies')
        self.write('lib.js','exports.format = value => value.trim();\n')
        self.write('main.js','const {format} = require("./lib");\nconst output = format(" hello ");\n')
        definitions=self.nav.run(self.runtime,'definition',{'path':'main.js','line':2,'column':16})['results']
        self.assertTrue(any(r['path']=='lib.js' for r in definitions),definitions)

    def test_typescript_real_bindings(self):
        if self.nav.health()['javascriptTypescript']!='typescript-language-service':self.skipTest('Install navigation npm dependencies')
        self.write('lib.ts','export function total(a: number, b: number) { return a + b; }\n')
        self.write('main.ts','import {total as add} from "./lib";\nconst value = add(2, 3);\nfunction shadow(add: string) { return add; }\nconst wrong: number = "text";\n')
        definition=self.nav.run(self.runtime,'definition',{'path':'main.ts','line':2,'column':15})['results'];self.assertEqual(definition[0]['path'],'lib.ts');self.assertEqual(definition[0]['name'],'total')
        references=self.nav.run(self.runtime,'references',{'path':'lib.ts','line':1,'column':18})['results'];self.assertTrue(any(r['path']=='main.ts' and r['line']==2 for r in references));self.assertFalse(any(r['path']=='main.ts' and r['line']==3 for r in references))
        diagnostics=self.nav.run(self.runtime,'diagnostics',{'path':'main.ts'})['results'];self.assertTrue(any(r['code']==2322 for r in diagnostics))
        names=self.nav.run(self.runtime,'symbols',{'query':'shadow','limit':1});self.assertEqual(names['results'][0]['name'],'shadow');self.assertIn('typescript-language-service',names['engines'])

    def test_analysis_helpers_are_private_and_pinned(self):
        directory=self.root/'analysis'
        for name,text in [('service.cjs','// helper'),('node_modules/typescript/package.json','{}'),('node_modules/typescript/lib/typescript.js','// compiler')]:
            target=directory/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
        runtime=Runtime(self.root,[],navigation_dir=directory)
        try:
            runtime.navigation.verify()
            with self.assertRaises(PermissionError):runtime.path('analysis/service.cjs')
            (directory/'service.cjs').write_text('// edited')
            with self.assertRaisesRegex(ValueError,'Trusted navigation files changed'):runtime.navigation.verify()
        finally:runtime.close()
