import sys
from docx import Document
from docx.shared import Inches
if sys.argv[1]=='create':
 d=Document();d.add_heading('Independent Word document',0);d.add_heading('Overview',1)
 p=d.add_paragraph('Normal ');p.add_run('bold proof').bold=True;p.add_run(' italic proof').italic=True
 d.add_paragraph('First item','List Bullet');d.add_paragraph('Second item','List Bullet')
 t=d.add_table(rows=2,cols=2);t.cell(0,0).text='Column';t.cell(1,1).text='Value'
 d.add_page_break();d.add_paragraph('After break');d.save(sys.argv[2])
else:
 d=Document(sys.argv[2]);assert any(p.text=='DOCX proof' and p.style.name=='Heading 1' for p in d.paragraphs)
 assert any(r.bold and r.text=='Bold text' for p in d.paragraphs for r in p.runs)
 assert d.tables[0].cell(1,1).text=='Value';assert len(d.inline_shapes)==1
 from zipfile import ZipFile
 with ZipFile(sys.argv[2]) as z:
  xml=z.read('word/document.xml').decode();assert 'hyperlink' in xml;assert 'w:type="page"' in xml;assert 'w:numPr' in xml
 print('PASS: python-docx reads headings, bold, table, image, links, page breaks and lists.')
