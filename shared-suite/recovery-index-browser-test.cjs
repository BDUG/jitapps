const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.route('http://recovery.test/**',route=>route.fulfill({contentType:'text/html',body:'<body>Recovery fixture</body>'}));
  await page.goto('http://recovery.test/');
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('agentic-suite-recovery',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('points',{keyPath:'id'});
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{const db=request.result,tx=db.transaction('points','readwrite');
    tx.objectStore('points').add({id:'old',tool:'textiX',label:'Preserved named version',createdAt:'2026-01-01T00:00:00.000Z',bytes:20,document:{text:'Original'}});
    tx.objectStore('points').add({id:'other',tool:'codeiX',label:'Other app',createdAt:'2026-01-01T00:00:00.000Z',bytes:20,document:{text:'Other'}});
    tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
   };
  }));
  await page.addScriptTag({path:__dirname+'/workspace-core.js'});
  await page.addScriptTag({path:__dirname+'/workspace-store.js'});
  const result=await page.evaluate(async()=>{
   const original=IDBObjectStore.prototype.getAll;let scans=0;
   IDBObjectStore.prototype.getAll=function(...args){scans++;return original.apply(this,args);};
   try{
    const migrated=await SuiteWorkspaceStore.list('textiX');
    for(let i=0;i<12;i++)await SuiteWorkspaceStore.automatic('textiX',{text:'Checkpoint '+i});
    const repeated=await SuiteWorkspaceStore.automatic('textiX',{text:'Checkpoint 11'});
    const after=await SuiteWorkspaceStore.list('textiX');
    for(let i=0;i<29;i++)await SuiteWorkspaceStore.put('textiX','Named '+i,{text:'Named'});
    let limit=false;try{await SuiteWorkspaceStore.put('textiX','Overflow',{text:'Named'});}catch{limit=true;}
    return {migrated,after,repeated,limit,final:await SuiteWorkspaceStore.list('textiX'),other:await SuiteWorkspaceStore.list('codeiX'),scans};
   }finally{IDBObjectStore.prototype.getAll=original;}
  });
  assert.equal(result.migrated[0].document.text,'Original');assert.equal(result.after.length,11);
  assert.equal(result.after.filter(point=>point.kind==='automatic').length,10);
  assert.equal(result.repeated.document.text,'Checkpoint 11');assert.equal(result.final.length,40);
  assert.ok(result.limit);assert.equal(result.other.length,1);assert.equal(result.scans,0);
  console.log('PASS: recovery migration preserves versions, indexed reads isolate apps, checkpoints rotate/deduplicate and named retention limits remain intact.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
