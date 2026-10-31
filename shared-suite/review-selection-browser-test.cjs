const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.locator('#suite-workspace-open').click();
  const before=await page.evaluate(()=>SuiteWorkspace.adapter.snapshot());
  await page.evaluate(async()=>{const value=SuiteWorkspace.adapter.snapshot();value.name='Review selection test';value.html='<p>Reviewed content</p>';await SuiteWorkspace.review(value,'Two-field change');});
  const checks=page.locator('#sw-changes input[type=checkbox]');
  assert.equal(await checks.count(),2);
  await page.evaluate(()=>window.originalReviewInput=document.querySelector('#sw-changes input'));
  await checks.first().uncheck();
  assert.ok(await page.evaluate(()=>originalReviewInput===document.activeElement&&originalReviewInput===document.querySelector('#sw-changes input')));
  assert.match(await page.locator('#sw-review-summary').textContent(),/1 of 2/);
  await page.locator('#sw-review-none').click();
  assert.ok(await page.locator('#sw-apply').isDisabled());
  assert.equal(await page.locator('#sw-changes input:checked').count(),0);
  await page.locator('#sw-review-all').click();
  assert.equal(await page.locator('#sw-changes input:checked').count(),2);
  await checks.first().uncheck();
  assert.match(await page.locator('#sw-review-summary').textContent(),/1 of 2/);
  assert.ok(await page.evaluate(()=>originalReviewInput===document.querySelector('#sw-changes input')));
  assert.deepEqual(await page.evaluate(()=>SuiteWorkspace.adapter.snapshot()),before);
  await page.locator('#sw-apply').click();
  await page.waitForFunction(()=>document.querySelector('#sw-status').textContent.startsWith('Updated'));
  const after=await page.evaluate(()=>SuiteWorkspace.adapter.snapshot());
  assert.equal(after.name,before.name);assert.equal(after.html,'<p>Reviewed content</p>');
  console.log('PASS: review selection preserves DOM/focus, bulk toggles remain consistent, and only selected fields apply.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
