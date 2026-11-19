import io
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from server import presentation_render as R

class RenderTests(unittest.TestCase):
    def package(self,relationship=''):
        data=io.BytesIO()
        with zipfile.ZipFile(data,'w') as archive:
            archive.writestr('ppt/presentation.xml','<p:presentation xmlns:p="'+R.P+'"><p:sldIdLst><p:sldId/></p:sldIdLst></p:presentation>')
            archive.writestr('ppt/_rels/presentation.xml.rels','<Relationships>'+relationship+'</Relationships>')
        return data.getvalue()
    def test_missing_engine_has_actionable_fallback(self):
        with patch.object(R.shutil,'which',return_value=None),self.assertRaisesRegex(ValueError,'Editable objects'):R.render(b'file')
    @unittest.skipUnless(importlib.util.find_spec('fitz'),'Optional PyMuPDF is not installed')
    def test_external_media_and_unsafe_archives_do_not_launch_office(self):
        with patch.object(R.shutil,'which',return_value='/usr/bin/soffice'),patch.object(R.subprocess,'Popen') as run:
            with self.assertRaisesRegex(ValueError,'External linked'):R.render(self.package('<Relationship Id="r" Type="image" Target="https://invalid.example/img" TargetMode="External"/>'))
            data=io.BytesIO()
            with zipfile.ZipFile(data,'w') as archive:archive.writestr('../escape','bad')
            with self.assertRaisesRegex(ValueError,'Unsafe'):R.render(data.getvalue())
            run.assert_not_called()
    @unittest.skipUnless(importlib.util.find_spec('fitz'),'Optional PyMuPDF is not installed')
    def test_render_failure_does_not_return_partial_slides(self):
        with patch.object(R.shutil,'which',return_value='/usr/bin/soffice'),patch.object(R.subprocess,'Popen') as run:
            run.return_value.returncode=1
            with self.assertRaisesRegex(ValueError,'could not render'):R.render(self.package())

    @unittest.skipUnless(importlib.util.find_spec('fitz'),'Optional PyMuPDF is not installed')
    def test_content_sizes_and_package_counts_do_not_block_office(self):
        class LargePayload(bytes):
            def __len__(self):return 26_000_000
        class Part:
            def __init__(self,index):self.filename=f'media/{index}.bin'
            @property
            def file_size(self):raise AssertionError('Do not inspect content size')
        payload=LargePayload(self.package())
        with zipfile.ZipFile(io.BytesIO(self.package())) as archive:
            with patch.object(R.shutil,'which',return_value='/usr/bin/soffice'),patch.object(R.zipfile,'ZipFile') as opened,patch.object(R.subprocess,'Popen') as run:
                proxy=opened.return_value.__enter__.return_value
                proxy.infolist.return_value=[Part(i) for i in range(4001)]
                proxy.namelist.side_effect=archive.namelist
                proxy.read.side_effect=archive.read
                run.return_value.returncode=1
                with self.assertRaisesRegex(ValueError,'could not render'):
                    R.render(payload)
                run.assert_called_once()
