const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.locator('#suite-workspace-open').click();
  await page.evaluate(()=>window.originalCommand=document.querySelector('[data-command-id="workspace:search"]'));
  await page.locator('#sw-command-query').fill('Find and replace content');
  assert.ok(await page.evaluate(()=>originalCommand===document.querySelector('[data-command-id="workspace:search"]')));
  await page.getByRole('button',{name:'Pin Find and replace content',exact:true}).click();
  assert.ok(await page.getByRole('button',{name:'Unpin Find and replace content',exact:true}).evaluate(el=>el===document.activeElement));
  await page.locator('#sw-command-filter').selectOption('pinned');
  await page.getByRole('button',{name:'Unpin Find and replace content',exact:true}).click();
  assert.ok(await page.locator('#sw-command-query').evaluate(el=>el===document.activeElement));
  await page.locator('#sw-command-filter').selectOption('all');
  assert.ok(await page.evaluate(()=>originalCommand===document.querySelector('[data-command-id="workspace:search"]')));
  await page.locator('#sw-command-query').press('ArrowDown');
  assert.ok(await page.evaluate(()=>document.activeElement===originalCommand));
  await page.evaluate(()=>{
   const button=document.createElement('button');button.id='fit';button.textContent='Runtime test action';button.onclick=()=>window.staleActionRan=true;document.body.append(button);
  });
  await page.locator('#sw-command-query').fill('Runtime test action');
  assert.equal(await page.locator('[data-command-id="editor:fit"]').count(),1);
  await page.evaluate(()=>document.querySelector('#fit').hidden=true);
  await page.locator('[data-command-id="editor:fit"]').click();
  await page.waitForFunction(()=>document.querySelector('#sw-status').textContent.includes('no longer available'));
  assert.equal(await page.evaluate(()=>!!window.staleActionRan),false);
  console.log('PASS: command rows survive searches, pinning preserves focus, pinned removal restores search focus and execution rejects stale native actions.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
