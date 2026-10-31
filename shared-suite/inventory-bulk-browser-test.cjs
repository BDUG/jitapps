const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.waitForFunction(()=>window.SuiteInventoryUI);
  await page.evaluate(()=>{window.inventoryBuilds=0;SuiteCapabilities.inventory=()=>{inventoryBuilds++;return Array.from({length:60},(_,i)=>({name:'Item '+i,group:i<40?'keep':'other'}));};SuiteWorkspace.open('tools');});
  await page.locator('#sc-view').click();
  await page.locator('#sc-select-page').click();assert.match(await page.locator('#sc-count').textContent(),/25 selected/);
  await page.locator('#sc-next').click();await page.locator('#sc-select-page').click();assert.match(await page.locator('#sc-count').textContent(),/50 selected/);
  await page.locator('#sc-clear-selection').click();
  await page.locator('#sc-query').fill('keep');await page.locator('#sc-select-matching').click();
  assert.match(await page.locator('#sc-count').textContent(),/40 selected/);
  await page.locator('#sc-next').click();assert.equal(await page.locator('#sc-records input:checked').count(),15);
  await page.locator('#sc-invert-matching').click();assert.match(await page.locator('#sc-count').textContent(),/0 selected/);
  await page.locator('#sc-query').fill('other');await page.locator('#sc-select-matching').click();
  await page.locator('#sc-query').fill('keep');await page.locator('#sc-invert-matching').click();
  assert.match(await page.locator('#sc-count').textContent(),/60 selected/);
  await page.locator('#sc-invert-matching').click();assert.match(await page.locator('#sc-count').textContent(),/20 selected/);
  await page.locator('#sc-scope').selectOption('selected');
  const result=await page.evaluate(()=>({rows:SuiteInventoryUI.exportRows(),builds:inventoryBuilds}));
  assert.equal(result.rows.length,20);assert.ok(result.rows.every(row=>row.group==='other'));assert.equal(result.builds,1);
  console.log('PASS: inventory bulk selection spans pages, inversion preserves nonmatches, complete selected exports avoid rebuilding inventory.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
