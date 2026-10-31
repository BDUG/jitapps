const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(()=>SuiteWorkspace.open('templates'));
  await page.locator('#st-name').fill('One saved template');
  const before=await page.evaluate(()=>SuiteWorkspace.adapter.snapshot());
  await page.evaluate(()=>{
   window.originalValidate=SuiteWorkspaceAdapter.validate;
   SuiteWorkspaceAdapter.validate=()=>new Promise(resolve=>window.releaseValidation=resolve);
   document.querySelector('#st-save').onclick();document.querySelector('#st-save').onclick();
  });
  assert.ok(await page.locator('#st-save').isDisabled());
  assert.ok(await page.locator('#st-name').isDisabled());
  await page.evaluate(()=>releaseValidation());
  await page.waitForFunction(()=>!document.querySelector('#st-save').disabled);
  assert.equal(await page.evaluate(async()=>(await SuiteTemplates.list('textiX')).length),1);
  await page.getByRole('button',{name:'Edit metadata',exact:true}).click();
  assert.match(await page.locator('#st-selection').textContent(),/Editing template metadata: One saved template/);
  await page.locator('#st-clear-selection').click();
  assert.equal(await page.locator('#st-name').inputValue(),'');
  assert.ok(await page.locator('#st-update').isDisabled());
  assert.ok(await page.locator('#st-name').evaluate(el=>document.activeElement===el));
  assert.deepEqual(await page.evaluate(()=>SuiteWorkspace.adapter.snapshot()),before);
  await page.locator('#st-name').fill('Failure test');
  await page.evaluate(()=>{SuiteWorkspaceAdapter.validate=async()=>{throw Error('Validation refused');};});
  await page.locator('#st-save').click();
  await page.waitForFunction(()=>document.querySelector('#st-status').textContent==='Validation refused');
  assert.ok(await page.locator('#st-save').isEnabled());
  assert.equal(await page.evaluate(async()=>(await SuiteTemplates.list('textiX')).length),1);
  console.log('PASS: duplicate saves are guarded, selection is explicit, clearing preserves the document, and failed actions release controls.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
