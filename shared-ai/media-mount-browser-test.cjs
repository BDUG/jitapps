const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setContent('<main></main>');
  await page.addScriptTag({path:__dirname+'/multimodal.js'});
  await page.evaluate(()=>{
   window.references=SuiteMultimodal.mount({container:document.querySelector('main'),id:'test',label:'References'});
   references.add({name:'first.txt',kind:'file',mimeType:'application/pdf',dataUrl:'data:application/pdf;base64,JVBERi0xLjc=',bytes:8});
   window.original=document.querySelector('#test-list').firstElementChild;
  });
  const note=page.getByRole('textbox',{name:'Reference note for first.txt',exact:true});
  await note.fill('Preserve this annotation');
  await note.focus();
  await page.evaluate(()=>references.add({name:'second.txt',kind:'text',content:'Second reference'}));
  assert.ok(await page.evaluate(()=>original===document.querySelector('#test-list').firstElementChild));
  assert.ok(await note.evaluate(el=>el===document.activeElement));
  assert.equal(await note.inputValue(),'Preserve this annotation');
  assert.equal(await page.locator('#test-attach').textContent(),'References · 2');
  await page.evaluate(()=>references.consume(references.items().filter(file=>file.name==='second.txt')));
  assert.ok(await page.evaluate(()=>original===document.querySelector('#test-list').firstElementChild));
  await page.getByRole('button',{name:'Remove first.txt',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>references.items()),[]);
  assert.equal(await page.locator('#test-attach').textContent(),'References');
  assert.equal(await page.locator('#test-list').getAttribute('aria-label'),'0 attached references');
  console.log('PASS: reusable media controls preserve row identity, focus, annotations and consume/remove semantics.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
