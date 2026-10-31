const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.locator('#suite-hub-open').click();
  const count=await page.locator('#hub-apps a').count();assert.ok(count>10);
  await page.evaluate(()=>window.originalAppLink=[...document.querySelectorAll('#hub-apps a')].find(a=>a.textContent.includes('codeiX')));
  await page.locator('#hub-search').fill('codeiX');
  assert.equal(await page.locator('#hub-apps a').count(),1);
  assert.ok(await page.evaluate(()=>originalAppLink===document.querySelector('#hub-apps a')));
  await page.locator('#hub-search').press('ArrowDown');
  assert.ok(await page.evaluate(()=>document.activeElement===originalAppLink));
  await page.keyboard.press('ArrowUp');
  assert.ok(await page.locator('#hub-search').evaluate(el=>el===document.activeElement));
  await page.getByRole('button',{name:'Pin codeiX',exact:true}).click();
  assert.ok(await page.getByRole('button',{name:'Unpin codeiX',exact:true}).evaluate(el=>el===document.activeElement));
  await page.getByRole('button',{name:'Unpin codeiX',exact:true}).click();
  assert.ok(await page.getByRole('button',{name:'Pin codeiX',exact:true}).evaluate(el=>el===document.activeElement));
  await page.locator('#hub-search').fill('Nothing matches this');
  assert.equal(await page.locator('#hub-apps a').count(),0);
  await page.locator('#hub-search').fill('');
  assert.equal(await page.locator('#hub-apps a').count(),count);
  assert.ok(await page.evaluate(()=>originalAppLink.isConnected));
  await page.locator('#hub-search').press('ArrowDown');await page.keyboard.press('End');
  assert.ok(await page.locator('#hub-apps a').last().evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Home');
  assert.ok(await page.locator('#hub-apps a').first().evaluate(el=>el===document.activeElement));
  await page.evaluate(()=>{SuiteWorkspaceAdapter.isBusy=()=>true;});
  const before=page.url();await page.locator('#hub-apps a').first().click();
  assert.equal(page.url(),before);assert.match(await page.locator('#hub-status').textContent(),/Stop active operations/);
  console.log('PASS: switcher row reuse, pin/unpin focus, empty search recovery, keyboard navigation and busy-operation guard.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
