const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  const baseline=await page.evaluate(()=>SuiteWorkspace.adapter.snapshot());
  const ids=await page.evaluate(async()=>{
   const before={nodes:Array.from({length:125},(_,i)=>({name:'Before '+i}))};
   const after={nodes:Array.from({length:125},(_,i)=>({name:'After '+i}))};
   return [(await SuiteWorkspaceStore.put('textiX','Before',before)).id,(await SuiteWorkspaceStore.put('textiX','After',after)).id];
  });
  await page.locator('#suite-workspace-open').click();
  await page.locator('[data-panel=history]').click();
  await page.locator('details').filter({has:page.locator('#sw-compare')}).locator('summary').click();
  await page.locator('#sw-compare-before').selectOption(ids[0]);
  await page.locator('#sw-compare-after').selectOption(ids[1]);
  assert.ok(await page.locator('#sw-compare-export').isDisabled());
  await page.locator('#sw-compare').click();
  assert.equal(await page.locator('#sw-comparison-range').textContent(),'1–50 of 125 differences');
  assert.match(await page.locator('#sw-history-comparison').textContent(),/After 49/);
  assert.ok(!(await page.locator('#sw-history-comparison').textContent()).includes('After 50'));
  await page.locator('#sw-comparison-next').click();
  await page.locator('#sw-comparison-next').click();
  assert.equal(await page.locator('#sw-comparison-range').textContent(),'101–125 of 125 differences');
  assert.match(await page.locator('#sw-history-comparison').textContent(),/After 124/);
  assert.ok(await page.locator('#sw-comparison-next').isDisabled());
  const download=page.waitForEvent('download');await page.locator('#sw-compare-export').click();
  const report=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));assert.equal(report.changes.length,125);
  await page.locator('#sw-history-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#sw-compare-export').disabled);
  assert.equal(await page.locator('#sw-history-comparison').textContent(),'');
  assert.deepEqual(await page.evaluate(()=>SuiteWorkspace.adapter.snapshot()),baseline);
  console.log('PASS: every version difference is browsable, export stays complete, refreshed selections invalidate comparison, and documents remain unchanged.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
