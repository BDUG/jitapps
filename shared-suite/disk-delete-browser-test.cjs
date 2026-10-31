const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  const result=await page.evaluate(async()=>{
   await SuiteDisk.write('chosen/one.txt',new Blob(['one']));
   await SuiteDisk.write('chosen/two.txt',new Blob(['two']));
   await SuiteDisk.write('chosen-other/keep.txt',new Blob(['keep']));
   await SuiteDisk.write('also.txt',new Blob(['also']));
   let changes=0,reads=0;const changed=()=>changes++;
   addEventListener('suite-disk-change',changed);
   const original=IDBObjectStore.prototype.getAll;
   IDBObjectStore.prototype.getAll=function(...args){if(this.transaction.db.name==='agentic-suite-disk')reads++;return original.apply(this,args);};
   let removed;
   try{removed=await SuiteDisk.removeMany(['chosen','chosen/one.txt','also.txt']);}
   finally{removeEventListener('suite-disk-change',changed);IDBObjectStore.prototype.getAll=original;}
   const kept=await SuiteDisk.get('chosen-other/keep.txt');
   await SuiteDisk.write('rollback/one.txt',new Blob(['one']));
   await SuiteDisk.write('rollback/two.txt',new Blob(['two']));
   const originalDelete=IDBObjectStore.prototype.delete;let deletes=0,failed=false;
   IDBObjectStore.prototype.delete=function(...args){if(this.transaction.db.name==='agentic-suite-disk'&&++deletes===2)throw Error('Simulated failure');return originalDelete.apply(this,args);};
   try{await SuiteDisk.removeMany(['rollback']);}catch{failed=true;}finally{IDBObjectStore.prototype.delete=originalDelete;}
   return {removed,changes,reads,kept:await kept.blob.text(),failed,rollback:(await SuiteDisk.list('rollback')).length};
  });
  assert.equal(result.removed.removed,4);assert.equal(result.changes,1);assert.equal(result.reads,1);
  assert.equal(result.kept,'keep');assert.equal(result.failed,true);assert.equal(result.rollback,2);
  const peer=await page.context().newPage();
  await peer.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await peer.evaluate(()=>{window.remoteChanges=0;addEventListener('suite-disk-change',()=>remoteChanges++);});
  await page.evaluate(()=>SuiteDisk.write('cross-tab.txt',new Blob(['Shared'])));
  await peer.waitForFunction(()=>remoteChanges===1);
  await peer.close();
  await page.locator('#suite-disk-open').click();
  await page.getByRole('checkbox',{name:'Select rollback',exact:true}).check();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#sd-delete').click();
  await page.waitForFunction(()=>document.querySelector('#sd-status').textContent==='Deleted 3 file(s) and folder(s).');
  assert.equal(await page.locator('#sd-delete').textContent(),'Delete selected');
  assert.ok(await page.locator('#sd-delete').isDisabled());
  console.log('PASS: bulk deletion uses one transaction/event, respects folder boundaries, rolls back failures and restores UI controls.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
