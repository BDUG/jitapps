const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   const document=SuiteWorkspace.adapter.snapshot();
   await SuiteTemplates.putMany('textiX',Array.from({length:61},(_,i)=>({details:{name:'Template '+String(i).padStart(3,'0'),tags:['sample']},document})));
   const original=SuiteTemplates.list;window.templateReads=0;
   SuiteTemplates.list=(...args)=>{templateReads++;return original(...args);};
  });
  await page.evaluate(()=>SuiteWorkspace.open('templates'));
  await page.waitForFunction(()=>document.querySelector('#st-range').textContent==='1–25 of 61 templates');
  const reads=await page.evaluate(()=>templateReads);
  assert.equal(await page.locator('#st-list .sw-item').count(),25);
  await page.locator('#st-next').click();await page.locator('#st-next').click();
  assert.equal(await page.locator('#st-list .sw-item').count(),11);
  assert.ok(await page.locator('#st-next').isDisabled());
  await page.locator('#st-query').fill('Template 060');
  assert.equal(await page.locator('#st-list .sw-item').count(),1);
  assert.equal(await page.evaluate(()=>templateReads),reads);
  await page.getByRole('button',{name:'Edit metadata',exact:true}).click();
  assert.ok(await page.locator('#st-update').isEnabled());
  await page.evaluate(async()=>{const record=(await SuiteTemplates.list('textiX')).find(record=>record.name==='Template 060');await SuiteTemplates.remove(record.id,'textiX');});
  await page.locator('#st-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#st-update').disabled);
  assert.match(await page.locator('#st-list').textContent(),/No templates match/);
  assert.equal(await page.locator('#st-list').getAttribute('aria-busy'),'false');
  await page.evaluate(()=>{SuiteTemplates.list=async()=>{throw Error('Template storage failed');};});
  await page.locator('#st-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#st-status').textContent==='Template storage failed');
  assert.ok(await page.locator('#st-refresh').isEnabled());
  console.log('PASS: template paging/filtering avoid storage rereads, empty states are explicit, stale selections clear and failed loads release controls.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
