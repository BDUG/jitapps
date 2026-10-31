const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.waitForFunction(()=>window.SuiteNotebook);await page.evaluate(()=>SuiteNotebook.open());
  await page.evaluate(()=>{
   window.startRead=(name,key)=>{
    const input=document.querySelector('#nb-file');
    Object.defineProperty(input,'files',{configurable:true,value:[{name,text:()=>new Promise(resolve=>window[key]=resolve)}]});
    return input.onchange();
   };
   window.firstRead=startRead('old.json','resolveOld');window.secondRead=startRead('latest.json','resolveLatest');
  });
  assert.ok(await page.locator('#nb-apply').isDisabled());
  assert.equal(await page.locator('#nb-preview').getAttribute('aria-busy'),'true');
  await page.evaluate(async()=>{resolveLatest(JSON.stringify({...SuiteNotebookCore.empty('textiX'),title:'Latest notebook'}));await secondRead;resolveOld('INVALID OLD JSON');await firstRead;});
  assert.match(await page.locator('#nb-import-summary').textContent(),/Latest notebook/);
  assert.ok(await page.locator('#nb-apply').isEnabled());
  await page.locator('#nb-policy').selectOption('replace');await page.locator('#nb-apply').click();
  assert.equal(await page.locator('#nb-title').inputValue(),'Latest notebook');
  await page.evaluate(()=>{window.thirdRead=startRead('discarded.json','resolveDiscarded');});
  await page.locator('#nb-discard').click();
  await page.evaluate(async()=>{resolveDiscarded(JSON.stringify({...SuiteNotebookCore.empty('textiX'),title:'Discarded'}));await thirdRead;});
  assert.ok(await page.locator('#nb-preview').isHidden());
  assert.equal(await page.locator('#nb-status').textContent(),'Import discarded.');
  assert.equal(await page.locator('#nb-title').inputValue(),'Latest notebook');
  await page.evaluate(()=>{window.fourthRead=startRead('closed.json','resolveClosed');});
  await page.locator('#nb-close').click();
  await page.waitForFunction(()=>document.querySelector('#nb-preview').hidden);
  await page.evaluate(async()=>{resolveClosed('INVALID CLOSED JSON');await fourthRead;SuiteNotebook.open();});
  assert.ok(await page.locator('#nb-preview').isHidden());
  assert.equal(await page.locator('#nb-title').inputValue(),'Latest notebook');
  console.log('PASS: latest notebook import wins, superseded input is not parsed, discard/close invalidate reads and only reviewed data applies.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
