const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  const result=await page.evaluate(async()=>{
   await SuiteDisk.write('a/direct.txt',new Blob(['Exact bytes'],{type:'text/plain'}));
   await SuiteDisk.write('a/nested/hidden.txt',new Blob(['Nested']));
   await SuiteDisk.write('ab/other.txt',new Blob(['Other folder']));
   await SuiteDisk.write('root.txt',new Blob(['Root']));
   const originalAll=IDBObjectStore.prototype.getAll,originalGet=IDBObjectStore.prototype.get;
   let allReads=0;const keys=[];
   IDBObjectStore.prototype.getAll=function(...args){if(this.transaction.db.name==='agentic-suite-disk')allReads++;return originalAll.apply(this,args);};
   IDBObjectStore.prototype.get=function(...args){if(this.transaction.db.name==='agentic-suite-disk')keys.push(args[0]);return originalGet.apply(this,args);};
   try{
    const single=await SuiteDisk.get('a/direct.txt'),missing=await SuiteDisk.get('missing.txt');
    const folder=await SuiteDisk.list('a'),absent=await SuiteDisk.list('missing'),root=await SuiteDisk.list();
    return {single:await single.blob.text(),missing,folder:folder.map(e=>e.path),absent,root:root.map(e=>e.path),allReads,keys};
   }finally{IDBObjectStore.prototype.getAll=originalAll;IDBObjectStore.prototype.get=originalGet;}
  });
  assert.equal(result.single,'Exact bytes');assert.equal(result.missing,null);
  assert.deepEqual(result.folder,['a/nested','a/direct.txt']);assert.deepEqual(result.absent,[]);
  assert.deepEqual(result.root,['a','ab','root.txt']);assert.equal(result.allReads,0);
  assert.ok(!result.keys.includes('a/nested/hidden.txt'));assert.ok(!result.keys.includes('ab/other.txt'));
  console.log('PASS: indexed single-file reads and direct-child folder listings preserve bytes/order without reading unrelated blobs.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
