"""Render uploaded PPTX slides with a local office engine; no model calls."""
import base64
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import threading
import zipfile
import io
import posixpath
import xml.etree.ElementTree as ET

SLOTS=threading.BoundedSemaphore(1)
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'

def render(payload):
    binary=shutil.which('soffice') or shutil.which('libreoffice')
    if not binary:raise ValueError('Preserve appearance requires LibreOffice on the Python server. Install LibreOffice Impress, or choose Editable objects import.')
    try:import fitz
    except ImportError:raise ValueError('Preserve appearance requires PyMuPDF on the Python server (pip install PyMuPDF), or choose Editable objects import.') from None
    if not payload:raise ValueError('Choose a nonempty PPTX presentation')
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        entries=archive.infolist()
        if any('..' in e.filename.split('/') or e.filename.startswith('/') or '\\' in e.filename for e in entries):raise ValueError('Unsafe package path')
        if 'ppt/presentation.xml' not in archive.namelist():raise ValueError('Choose a PPTX presentation')
        for entry in entries:
            if entry.filename.endswith(('.xml','.rels')):
                data=archive.read(entry)
                if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('DTD/entity declarations are not supported')
                if entry.filename.endswith('.rels'):
                    root=ET.fromstring(data)
                    for relationship in root:
                        if relationship.get('TargetMode')=='External' and not relationship.get('Type','').endswith('/hyperlink'):
                            raise ValueError('External linked media/documents are not loaded. Embed them in PowerPoint first.')
        presentation=ET.fromstring(archive.read('ppt/presentation.xml'))
        count=len(presentation.findall('.//{'+P+'}sldId'))
        if count<1:raise ValueError('PPTX must contain at least one slide')
        def relations(part):
            directory,name=posixpath.split(part);relpath=directory+'/_rels/'+name+'.rels'
            if relpath not in archive.namelist():return {}
            return {r.get('Id'):(r.get('Type',''),posixpath.normpath(posixpath.join(directory,r.get('Target','')))) for r in ET.fromstring(archive.read(relpath)) if r.get('TargetMode')!='External'}
        links=relations('ppt/presentation.xml');notes=[]
        for slide in presentation.findall('.//{'+P+'}sldId'):
            _,part=links.get(slide.get('{'+R+'}id'),('',''))
            note=next((target for kind,target in relations(part).values() if kind.endswith('/notesSlide')),None)
            text=[]
            if note and note in archive.namelist():
                for shape in ET.fromstring(archive.read(note)).findall('.//{'+P+'}sp'):
                    if any(ph.get('type')=='body' for ph in shape.findall('.//{'+P+'}ph')):
                        text.extend(''.join(t.text or '' for t in paragraph.findall('.//{'+A+'}t')) for paragraph in shape.findall('.//{'+A+'}p'))
            notes.append('\n'.join(text))
        core=ET.fromstring(archive.read('docProps/core.xml')) if 'docProps/core.xml' in archive.namelist() else None
        title=core.findtext('{http://purl.org/dc/elements/1.1/}title') if core is not None else None
    if not SLOTS.acquire(False):raise ValueError('Presentation renderer is busy. Retry after the current import.')
    try:
        with tempfile.TemporaryDirectory(prefix='presentix-render-') as folder:
            root=Path(folder);source=root/'presentation.pptx';source.write_bytes(payload)
            profile=root/'profile';registry=profile/'user';registry.mkdir(parents=True)
            (registry/'registrymodifications.xcu').write_text('''<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateDocMode" oor:op="fuse"><value>0</value></prop></item></oor:items>''')
            result=subprocess.Popen([binary,'-env:UserInstallation='+profile.as_uri(),'--headless','--convert-to','pdf:impress_pdf_Export','--outdir',str(root),str(source)],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=os.name!='nt',env={**os.environ,'XDG_CACHE_HOME':str(root/'cache')})
            try:result.communicate(timeout=90)
            except subprocess.TimeoutExpired:
                if os.name!='nt':os.killpg(result.pid,signal.SIGKILL)
                else:result.kill()
                result.communicate(timeout=5)
                raise ValueError('Presentation rendering exceeded 90 seconds. Try a smaller deck.') from None
            pdf=root/'presentation.pdf'
            if result.returncode or not pdf.is_file():raise ValueError('Office conversion could not render this PPTX. Try Editable objects import.')
            slides=[]
            with fitz.open(pdf) as document:
                if len(document)!=count:raise ValueError('Rendered slide count differs from PPTX; no partial deck was imported')
                ratio=document[0].rect.height/document[0].rect.width
                if not .25<=ratio<=3:raise ValueError('Unsupported slide aspect ratio')
                for index,page in enumerate(document):
                    if not .25<=page.rect.height/page.rect.width<=3:raise ValueError('Unsupported page aspect ratio')
                    pixels=page.get_pixmap(matrix=fitz.Matrix(1920/page.rect.width,1920/page.rect.width),alpha=False)
                    image=pixels.tobytes('png');mime='png'
                    text=page.get_text()
                    slides.append({'title':(text.strip().split('\n')[0] if text.strip() else 'Slide '+str(index+1)),'text':text,'notes':notes[index],'src':'data:image/'+mime+';base64,'+base64.b64encode(image).decode()})
            return {'name':(title or 'Imported presentation'),'width':960,'height':960*ratio,'slides':slides,'warnings':['Rendered by LibreOffice as high-resolution static slide images. Masters, layout artwork, mixed text formatting, pictures and connectors are rendered together. Individual source objects are not editable in this mode.','Fonts/layout can differ from Microsoft PowerPoint. Embedded video, interactive links and object animations are not reproduced. Use the original PPTX for original editable objects and playback.']}
    finally:SLOTS.release()
