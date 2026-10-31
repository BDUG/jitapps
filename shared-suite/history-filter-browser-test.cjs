const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   const snapshot=SuiteWorkspace.adapter.snapshot();
   await SuiteWorkspaceStore.put('textiX','Alpha version',snapshot);
   await SuiteWorkspaceStore.put('textiX','Beta version',snapshot);
   const original=SuiteWorkspaceStore.list;
   window.historyReads=0;
   SuiteWorkspaceStore.list=(...args)=>{historyReads++;return original(...args);};
  });
  await page.locator('#suite-workspace-open').click();
  await page.locator('[data-panel=history]').click();
  await page.waitForFunction(()=>document.querySelector('#sw-points').textContent.includes('Beta version'));
  await page.evaluate(()=>{window.initialReads=historyReads;window.compareOption=document.querySelector('#sw-compare-before').firstElementChild;});
  await page.locator('#sw-history-filter').fill('Alpha');
  assert.equal(await page.locator('#sw-points .sw-item').count(),1);
  assert.match(await page.locator('#sw-history-count').textContent(),/^1 of /);
  assert.ok(await page.evaluate(()=>historyReads===initialReads&&compareOption===document.querySelector('#sw-compare-before').firstElementChild));
  await page.locator('#sw-history-filter').fill('No such saved version');
  assert.match(await page.locator('#sw-points').textContent(),/No versions match/);
  await page.locator('#sw-history-filter').fill('');
  await page.locator('#sw-history-kind').selectOption('automatic');
  assert.equal(await page.evaluate(()=>historyReads===initialReads),true);
  await page.locator('#sw-history-refresh').click();
  await page.waitForFunction(()=>historyReads>initialReads);
  await page.waitForFunction(()=>document.querySelector('#sw-points').getAttribute('aria-busy')==='false');
  await page.evaluate(()=>{SuiteWorkspaceStore.list=async()=>{throw Error('Recovery read failed');};});
  await page.locator('#sw-history-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#sw-status').textContent==='Recovery read failed');
  assert.ok(await page.locator('#sw-history-refresh').isEnabled());
  assert.equal(await page.locator('#sw-points').getAttribute('aria-busy'),'false');
  console.log('PASS: recovery filtering avoids storage reads, preserves comparison selectors and updates result counts; explicit refresh reloads storage.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
