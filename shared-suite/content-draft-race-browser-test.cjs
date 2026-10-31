const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   await SuiteTemplates.putMany('content-hub',['First reference','Second reference'].map(name=>{const document=SuiteContentHubCore.pack('textiX',name,{name,html:'<p>Reference</p>'});return {details:{name},document};}));
  });
  await page.locator('#suite-content-hub-open').click();
  await page.getByRole('checkbox',{name:'Select published content First reference',exact:true}).check();
  await page.locator('#ch-intent').selectOption('plan');
  await page.evaluate(()=>{
   const original=SuiteTemplates.list;window.draftReads=0;
   SuiteTemplates.list=(...args)=>{draftReads++;return new Promise(resolve=>window.releaseDraft=()=>resolve(original(...args)));};
   document.querySelector('#ch-ai-checked').onclick();document.querySelector('#ch-ai-checked').onclick();
  });
  assert.equal(await page.locator('#ch-ai-checked').textContent(),'Preparing draft…');
  await page.locator('#ch-clear-checked').click();
  await page.getByRole('checkbox',{name:'Select published content Second reference',exact:true}).check();
  await page.locator('#ch-intent').selectOption('compare');
  assert.ok(await page.locator('#ch-ai-checked').isDisabled());
  await page.evaluate(()=>releaseDraft());
  await page.waitForFunction(()=>!document.querySelector('#suite-content-hub').open);
  const draft=await page.locator('#sai-prompt').inputValue();
  assert.match(draft,/Propose an ordered plan/);assert.match(draft,/First reference/);assert.ok(!draft.includes('Second reference'));
  assert.equal(await page.evaluate(()=>draftReads),1);
  assert.equal(await page.locator('#ch-ai-checked').textContent(),'Draft AI from selected');
  console.log('PASS: draft preparation snapshots selection/intent, prevents duplicate reads and preserves later selection changes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
