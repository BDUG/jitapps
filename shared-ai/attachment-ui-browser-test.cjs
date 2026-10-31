const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:900,height:800}});
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.locator('#sai-launch').click();
  const input=page.locator('#sai-file');
  await input.setInputFiles({name:'first.txt',mimeType:'text/plain',buffer:Buffer.from('Keep this reference')});
  await page.waitForFunction(()=>document.querySelector('#sai-files').children.length===1);
  await page.evaluate(()=>window.firstAttachment=document.querySelector('#sai-files').firstElementChild);
  await input.setInputFiles({name:'second.txt',mimeType:'text/plain',buffer:Buffer.from('Another reference')});
  await page.waitForFunction(()=>document.querySelector('#sai-files').children.length===2);
  assert.ok(await page.evaluate(()=>firstAttachment===document.querySelector('#sai-files').firstElementChild));
  assert.equal(await page.locator('#sai-attach').textContent(),'Attach files · 2');
  await page.getByRole('button',{name:'Remove attachment second.txt',exact:true}).click();
  assert.ok(await page.evaluate(()=>firstAttachment===document.querySelector('#sai-files').firstElementChild));
  await page.locator('#sai-clear').click();
  assert.equal(await page.locator('#sai-files').getAttribute('aria-label'),'1 attached files');
  await page.getByRole('button',{name:'Remove attachment first.txt',exact:true}).click();
  assert.equal(await page.locator('#sai-files').locator(':scope > *').count(),0);
  assert.equal(await page.locator('#sai-attach').textContent(),'Attach files');
  console.log('PASS: attachment rows survive additions/removals, counts update and new conversations preserve references.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
