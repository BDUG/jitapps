const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.waitForFunction(()=>window.SuiteAutoRecovery);
  await page.evaluate(()=>SuiteAutoRecovery.capture());
  assert.equal(await page.evaluate(()=>SuiteAutoRecovery.status().dirty),false);
  await page.locator('#suite-workspace-open').click();
  await page.locator('#sw-command-query').fill('Search only');
  assert.equal(await page.evaluate(()=>SuiteAutoRecovery.status().dirty),false);
  await page.evaluate(()=>document.querySelector('#suite-workspace').close());
  await page.evaluate(()=>{
   document.querySelector('#editor').innerHTML='<p>Real document edit</p>';
   document.querySelector('#editor').dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.equal(await page.evaluate(()=>SuiteAutoRecovery.status().dirty),true);
  await page.evaluate(()=>{
   const original=SuiteWorkspaceStore.automatic;
   SuiteWorkspaceStore.automatic=(...args)=>new Promise(resolve=>window.releaseCheckpoint=()=>resolve(original(...args)));
   window.pendingCheckpoint=SuiteAutoRecovery.capture();
  });
  assert.equal(await page.locator('#sw-auto-now').textContent(),'Saving checkpoint…');
  assert.ok(await page.locator('#sw-auto-now').isDisabled());
  await page.evaluate(()=>{
   document.querySelector('#editor').innerHTML='<p>Edit during save</p>';
   document.querySelector('#editor').dispatchEvent(new Event('input',{bubbles:true}));
   releaseCheckpoint();return pendingCheckpoint;
  });
  assert.equal(await page.evaluate(()=>SuiteAutoRecovery.status().dirty),true);
  assert.ok(await page.locator('#sw-auto-now').isEnabled());
  assert.equal(await page.locator('#sw-auto-now').textContent(),'Checkpoint now');
  console.log('PASS: shared controls do not dirty recovery, document edits do, in-flight saves show busy state and concurrent edits remain pending.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
