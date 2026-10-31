const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),base=process.env.BASE_URL||'http://127.0.0.1:8013';
  await page.goto(base+'/textiX/');
  await page.evaluate(async()=>{
   const entries=[{path:'z-folder',kind:'folder',modified:0},...[
    ['node10.txt',10,'text/plain',100],['node2.svg',2,'image/svg+xml',300],['alpha.txt',1,'text/plain',200]
   ].map(([path,size,type,modified])=>({path,kind:'file',blob:new Blob(['x'.repeat(size)],{type}),type,modified}))];
   await SuiteDisk.importEntries(entries,{policy:'keep',expectedSnapshot:SuiteDisk.fingerprint(await SuiteDisk.all())});
  });
  await page.locator('#suite-disk-open').click();
  await page.waitForFunction(()=>document.querySelector('#sd-list').getAttribute('aria-busy')==='false');
  const paths=()=>page.locator('#sd-list [data-path]').evaluateAll(nodes=>nodes.map(node=>node.dataset.path));
  assert.deepEqual(await paths(),['z-folder','alpha.txt','node2.svg','node10.txt']);
  await page.evaluate(()=>{const original=SuiteDisk.list;window.sortReads=0;SuiteDisk.list=(...args)=>{sortReads++;return original(...args);};});
  await page.locator('#sd-sort').selectOption('newest');assert.deepEqual(await paths(),['z-folder','node2.svg','alpha.txt','node10.txt']);
  await page.locator('#sd-sort').selectOption('type');assert.deepEqual(await paths(),['z-folder','node2.svg','alpha.txt','node10.txt']);
  await page.locator('#sd-sort').selectOption('name-desc');assert.deepEqual(await paths(),['z-folder','node10.txt','node2.svg','alpha.txt']);
  await page.locator('#sd-search').fill('ＮＯＤＥ');await page.locator('#sd-select-matching').click();
  await page.locator('#sd-sort').selectOption('largest');assert.deepEqual(await paths(),['node10.txt','node2.svg']);
  assert.equal(await page.locator('#sd-list input:checked').count(),2);assert.equal(await page.evaluate(()=>sortReads),0);
  await page.reload();await page.locator('#suite-disk-open').click();
  await page.waitForFunction(()=>document.querySelector('#sd-list').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#sd-sort').inputValue(),'largest');
  assert.deepEqual(await paths(),['z-folder','node10.txt','node2.svg','alpha.txt']);
  console.log('PASS: natural/reverse/date/size/type sorting, folders first, Unicode search, preserved selection, zero rereads and persisted sort preference.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
