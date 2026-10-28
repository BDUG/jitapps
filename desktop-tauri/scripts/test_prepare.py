import importlib.util
from pathlib import Path
import tempfile
import unittest
import json

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('desktop_prepare',HERE/'prepare.py');prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)
class StagingTest(unittest.TestCase):
    def test_all_apps_and_no_private_or_archived_content(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'source';root.mkdir()
            for directory in prepare.PUBLIC:
                (root/directory).mkdir(parents=True);(root/directory/'index.html').write_text(directory)
            (root/'index.html').write_text('desktop');(root/'LICENSE').write_text('license')
            for name in ('backup','.suite-agent','.git','server','desktop-tauri'):
                (root/name).mkdir();(root/name/'private.json').write_text('secret')
            for name in ('providers.json','search.json','profile.images.json'):(root/'architex'/name).write_text('secret')
            try:(root/'architex'/'secret-link.json').symlink_to(root/'architex'/'providers.json')
            except OSError:pass # Some Windows build accounts lack symlink privileges.
            (root/'architex'/'test.cjs').write_text('test')
            out=prepare.stage(root,Path(folder)/'staged')
            for app in prepare.APPS:self.assertTrue((out/app/'index.html').is_file())
            self.assertEqual((out/'index.html').read_text(),'desktop')
            self.assertFalse(any('secret' in p.read_text() for p in out.rglob('*') if p.is_file()))
            for name in ('backup','.suite-agent','.git','server','desktop-tauri'):self.assertFalse((out/name).exists())
            self.assertFalse((out/'architex/test.cjs').exists())
    def test_actual_suite_stages_every_registered_app(self):
        with tempfile.TemporaryDirectory() as folder:
            out=prepare.stage(prepare.ROOT,Path(folder)/'suite')
            self.assertEqual(len(prepare.APPS),17)
            for app in prepare.APPS:self.assertTrue((out/app/'index.html').exists())
            self.assertTrue((out/'shared-suite/apps.js').exists())
            self.assertTrue((out/'codingagentlib/javascript/loop.js').exists())
            self.assertFalse((out/'codingagentlib/python').exists())
            self.assertFalse((out/'server').exists())
            self.assertFalse((out/'backup').exists())
    def test_tauri_two_configuration(self):
        config=json.loads((prepare.DESKTOP/'src-tauri/tauri.conf.json').read_text())
        self.assertEqual(config['$schema'],'https://schema.tauri.app/config/2')
        self.assertEqual(config['app']['security']['capabilities'],[])
        self.assertEqual(config['bundle']['externalBin'],['binaries/suite-server'])
        self.assertEqual(config['bundle']['resources'],{'resources/suite/':'suite/'})
        for icon in config['bundle']['icon']:self.assertTrue((prepare.DESKTOP/'src-tauri'/icon).is_file())
if __name__=='__main__':unittest.main()
