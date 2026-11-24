const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{attachment,validate}=require('../src/attachments.cjs');
test('workspace references are explicit UTF-8 snapshots with provenance and line ranges',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-refs-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'source.js');await fs.writeFile(file,'hello 😀\nsecond line');const full=await attachment(root,file);assert.equal(full.path,'source.js');assert.equal(full.kind,'file');assert.equal(full.sha256.length,64);const selected=await attachment(root,file,{text:'second line',startLine:2,endLine:2});assert.equal(selected.kind,'selection');assert.equal(selected.startLine,2);assert.equal(selected.content,'second line');assert.equal(validate([full,selected]).length,2);await fs.writeFile(path.join(root,'binary'),Buffer.from([0,1,2]));await assert.rejects(attachment(root,path.join(root,'binary')),/Binary/);await fs.writeFile(path.join(root,'.env'),'key');await assert.rejects(attachment(root,path.join(root,'.env')),/private/);await assert.rejects(attachment(root,__filename),/workspace file/);});
test('references cannot escape via filesystem symlinks', {skip:process.platform==='win32'},async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-ref-link-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.symlink(__filename,path.join(root,'outside'));await assert.rejects(attachment(root,path.join(root,'outside')),/workspace file/);});
test('media snapshots preserve bytes and emit native named parts, latest snapshot wins',async t=>{
 const {modelContent}=require('../src/attachments.cjs'),root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-media-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const files=[];for(const [name,bytes]of [['screen.png',Buffer.from([137,80,78,71,0,255])],['voice.wav',Buffer.from('RIFF')],['brief.pdf',Buffer.from('%PDF')]]){const file=path.join(root,name);await fs.writeFile(file,bytes);const item=await attachment(root,file);assert.equal(Buffer.from(item.dataUrl.split(',')[1],'base64').compare(bytes),0);files.push(item);}
 const events=[{kind:'user',value:{status:'reference_files',attachments:files}}];
 const request={events,other:{dataUrl:'untouched app field'}},parts=modelContent(request);
 assert.deepEqual(parts.map(p=>p.type),['text','text','image_url','text','input_audio','text','file']);assert.equal(parts[4].input_audio.format,'wav');assert.equal(parts[6].file.filename,'brief.pdf');assert.ok(!parts[0].text.includes(';base64,'));assert.equal(JSON.parse(parts[0].text).other.dataUrl,'untouched app field');assert.match(parts[1].text,/screen.png/);
 const updated={...files[0],dataUrl:'data:image/png;base64,YQ=='};events.push({kind:'user',value:{status:'reference_files',attachments:[updated]}});
 assert.equal(modelContent(request).filter(p=>p.type==='image_url').length,1);assert.equal(modelContent(request)[2].image_url.url,updated.dataUrl);
 assert.equal(files[0].dataUrl,parts[2].image_url.url);assert.throws(()=>modelContent({events:[{kind:'user',value:{status:'reference_files',attachments:[{...updated,dataUrl:'data:image/png;base64,broken'}]}}]}),/Invalid native media/);
});

function buildZip(entries) {
  const zlib = require('node:zlib');
  const localParts = [];
  const cdParts = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const rawBuf = Buffer.from(content, 'utf8');
    const compBuf = zlib.deflateRawSync(rawBuf);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compBuf.length, 18);
    local.writeUInt32LE(rawBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    localParts.push(local, compBuf);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(compBuf.length, 20);
    cd.writeUInt32LE(rawBuf.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    cdParts.push(cd);
    offset += local.length + compBuf.length;
  }
  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, cdBuf, eocd]);
}

test('extracts text from docx, pptx, xlsx, pdf, svg, and image metadata', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-docs-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.writeFile(path.join(root, 'spec.docx'), buildZip([
    ['word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body></w:document>'],
  ]));
  await fs.writeFile(path.join(root, 'deck.pptx'), buildZip([
    ['ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide One Title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'],
  ]));
  await fs.writeFile(path.join(root, 'data.xlsx'), buildZip([
    ['xl/sharedStrings.xml', '<sst><si><t>Metric</t></si></sst>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>'],
  ]));
  await fs.writeFile(path.join(root, 'report.pdf'), Buffer.from('%PDF-1.4\nstream\nBT (Hello PDF) Tj ET\nendstream\n%%EOF'));
  await fs.writeFile(path.join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>Vector</text></svg>');
  const pngHeader = Buffer.alloc(24);
  pngHeader.writeUInt32BE(0x89504e47, 0);
  pngHeader.writeUInt32BE(128, 16);
  pngHeader.writeUInt32BE(64, 20);
  await fs.writeFile(path.join(root, 'shot.png'), pngHeader);

  const docx = await attachment(root, path.join(root, 'spec.docx'));
  assert.equal(docx.content, 'Hello DOCX');
  assert.equal(docx.extractedFrom, 'docx');

  const pptx = await attachment(root, path.join(root, 'deck.pptx'));
  assert.match(pptx.content, /--- Slide 1 ---/);
  assert.match(pptx.content, /Slide One Title/);

  const xlsx = await attachment(root, path.join(root, 'data.xlsx'));
  assert.match(xlsx.content, /A1=Metric\tB1=42/);

  const pdf = await attachment(root, path.join(root, 'report.pdf'));
  assert.equal(pdf.content, 'Hello PDF');
  assert.ok(pdf.dataUrl.startsWith('data:application/pdf;base64,'));

  const svg = await attachment(root, path.join(root, 'icon.svg'));
  assert.match(svg.content, /<svg/);

  const png = await attachment(root, path.join(root, 'shot.png'));
  assert.match(png.content, /128x64/);
  assert.ok(png.dataUrl.startsWith('data:image/png;base64,'));
});
