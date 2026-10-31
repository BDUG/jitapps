const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),base=process.env.BASE_URL||'http://127.0.0.1:8013';
  await page.route('**/__template_migration__',route=>route.fulfill({contentType:'text/html',body:'<html><body>Migration fixture</body></html>'}));
  await page.goto(base+'/__template_migration__');
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('agentic-suite-templates',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('templates',{keyPath:'id'});
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('templates','readwrite'),store=tx.objectStore('templates');
    for(const [id,tool,name] of [['text-old','textiX','Preserved text'],['code-old','codeiX','Preserved code'],['hub-old','content-hub','Preserved hub']])store.add({id,tool,name,description:'Existing v1 template',tags:['old'],document:{name,content:'Original bytes'},createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
    tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
   };
  }));
  await page.goto(base+'/textiX/');
  const result=await page.evaluate(async()=>{
   const original=IDBObjectStore.prototype.getAll;let scans=0;
   IDBObjectStore.prototype.getAll=function(...args){if(this.transaction.db.name==='agentic-suite-templates')scans++;return original.apply(this,args);};
   try{
    const text=await SuiteTemplates.list('textiX'),code=await SuiteTemplates.list('codeiX'),hub=await SuiteTemplates.list('content-hub');
    await SuiteTemplates.edit('text-old','textiX',{name:'Updated',description:'After upgrade',tags:['new']});
    return {text,code,hub,scans,updated:await SuiteTemplates.list('textiX'),missing:await SuiteTemplates.list('unknown')};
   }finally{IDBObjectStore.prototype.getAll=original;}
  });
  assert.equal(result.scans,0);assert.equal(result.text.length,1);assert.equal(result.text[0].document.content,'Original bytes');
  assert.equal(result.code[0].id,'code-old');assert.equal(result.hub[0].id,'hub-old');
  assert.equal(result.updated[0].name,'Updated');assert.equal(result.updated[0].document.content,'Original bytes');assert.deepEqual(result.missing,[]);
  console.log('PASS: v1 template migration preserves documents, per-tool lists use the index, metadata edits and app isolation remain intact.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
