const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   await SuiteTemplates.putMany('content-hub',Array.from({length:45},(_,i)=>SuiteContentHubCore.pack('textiX','Entry '+i,{name:'Entry '+i,html:'<p>Reference</p>'})).map(document=>({details:{name:document.name},document})));
   const original=SuiteContentHubCore.browse;window.browseCalls=0;
   SuiteContentHubCore.browse=(...args)=>{browseCalls++;return original(...args);};
  });
  await page.locator('#suite-content-hub-open').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ch-list .ch-item').length===20);
  await page.evaluate(()=>{window.originalCheckbox=document.querySelector('#ch-list input');window.initialBrowseCalls=browseCalls;});
  await page.locator('#ch-list input').first().check();
  assert.ok(await page.evaluate(()=>originalCheckbox===document.querySelector('#ch-list input')&&document.activeElement===originalCheckbox));
  assert.equal(await page.evaluate(()=>browseCalls===initialBrowseCalls),true);
  await page.locator('#ch-select-filtered').click();
  assert.match(await page.locator('#ch-selection-count').textContent(),/^45 selected/);
  assert.equal(await page.locator('#ch-list input:checked').count(),20);
  assert.ok(await page.evaluate(()=>originalCheckbox===document.querySelector('#ch-list input')));
  await page.locator('#ch-next').click();
  assert.equal(await page.locator('#ch-list input:checked').count(),20);
  assert.equal(await page.evaluate(()=>browseCalls===initialBrowseCalls),true);
  await page.evaluate(()=>{window.secondPageCheckbox=document.querySelector('#ch-list input');window.beforeClear=browseCalls;});
  await page.locator('#ch-clear-checked').click();
  assert.equal(await page.locator('#ch-list input:checked').count(),0);
  assert.ok(await page.evaluate(()=>secondPageCheckbox===document.querySelector('#ch-list input')&&browseCalls===beforeClear));
  assert.ok(await page.locator('#ch-export-checked').isDisabled());
  const cachedCalls=await page.evaluate(()=>browseCalls);
  await page.locator('#ch-query').fill('Entry 44');
  assert.equal(await page.locator('#ch-list .ch-item').count(),1);
  assert.equal(await page.evaluate(()=>browseCalls),cachedCalls+1);
  await page.locator('#ch-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#ch-list').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>browseCalls),cachedCalls+2);
  console.log('PASS: content selection preserves rows/focus, avoids repeated browsing, spans pages and updates bulk action controls.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
