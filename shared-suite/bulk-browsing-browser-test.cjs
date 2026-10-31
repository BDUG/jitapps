const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1400,height:1000}}),base=process.env.BASE_URL||'http://127.0.0.1:8013';
  const home=await context.newPage();await home.goto(base+'/');await home.waitForFunction(()=>window.SuiteDisk&&window.SuiteApps);
  const routes=await home.evaluate(()=>SuiteApps.map(app=>app.id+'/'));
  await home.evaluate(async()=>{for(let i=0;i<125;i++)await SuiteDisk.write((i<105?'keep-':'other-')+String(i).padStart(3,'0')+'.txt',new Blob(['Exact '+i],{type:'text/plain'}));});
  await home.close();
  for(const route of [...routes,'sketchiX/sketch.html','sketchiX/shape.html']){
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/'+route);
   await page.locator('#suite-disk-open').click();await page.waitForFunction(()=>document.querySelector('#sd-list').getAttribute('aria-busy')==='false');
   await page.evaluate(()=>{const list=SuiteDisk.list;window.folderReads=0;SuiteDisk.list=(...args)=>{folderReads++;return list(...args);};});
   await page.locator('#sd-search').fill('keep text');
   assert.match(await page.locator('#sd-match-count').textContent(),/^105 of 125/);
   await page.locator('#sd-sort').selectOption('largest');
   await page.locator('#sd-select-matching').click();assert.match(await page.locator('#sd-selection-count').textContent(),/^105 selected/);
   await page.locator('#sd-page-next').click();assert.equal(await page.locator('#sd-list input:checked').count(),5);
   await page.locator('#sd-search').fill('other');assert.match(await page.locator('#sd-selection-count').textContent(),/^105 selected/);
   await page.locator('#sd-clear-selection').click();assert.ok(await page.locator('#sd-download').isDisabled());
   assert.equal(await page.evaluate(()=>folderReads),0);await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#suite-disk-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),route+' narrow disk dialog');await page.setViewportSize({width:1400,height:1000});await page.locator('#sd-close').click();
   if(await page.evaluate(()=>!!window.SuiteWorkspaceAdapter&&!!window.SuiteWorkspace)){
    await page.waitForFunction(()=>window.SuiteInventoryUI);
    await page.evaluate(()=>SuiteWorkspace.open('tools'));await page.locator('#sc-view').click();
    if(await page.locator('#sc-select-matching').isEnabled()){
     await page.locator('#sc-select-page').click();assert.equal(await page.locator('#sc-records input:checked').count(),await page.locator('#sc-records input').count());await page.locator('#sc-clear-selection').click();
     await page.locator('#sc-select-matching').click();assert.ok(await page.locator('#sc-clear-selection').isEnabled());
     await page.locator('#sc-invert-matching').click();assert.ok(await page.locator('#sc-clear-selection').isDisabled());
    }
   }
   if(route==='shelliX/'){
    await page.evaluate(()=>{SuiteDisk.list=()=>new Promise((resolve,reject)=>window.rejectFolder=reject);window.pendingFolder=SuiteDiskUI.open();});
    await page.waitForFunction(()=>document.querySelector('#sd-list').getAttribute('aria-busy')==='true');
    assert.ok(await page.locator('#sd-list').evaluate(node=>node.inert));
    assert.ok(await page.locator('#sd-select-matching').evaluate(node=>!!node.closest('[inert]')));
    assert.ok(await page.locator('#sd-delete').isDisabled());
    await page.evaluate(async()=>{rejectFolder(Error('Folder storage failure'));await pendingFolder;});
    assert.equal(await page.locator('#sd-status').textContent(),'Folder storage failure');
    assert.equal(await page.locator('#sd-list').getAttribute('aria-busy'),'false');
    assert.ok(await page.locator('#sd-list').evaluate(node=>!node.inert));
   }
   assert.deepEqual(errors,[],route);console.log('PASS '+route+': cached folder search, cross-page bulk selection and available inventory bulk controls');await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
