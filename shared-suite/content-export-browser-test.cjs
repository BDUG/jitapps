const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   const packets=Array.from({length:30},(_,i)=>SuiteContentHubCore.pack('textiX','Export '+String(i).padStart(2,'0'),{name:'Native '+i,html:'<p>Exact '+i+'</p>'}));
   await SuiteTemplates.putMany('content-hub',packets.map(document=>({details:{name:document.name},document})));
   // An unrelated stored snapshot must not be parsed/copied during this export.
   await SuiteTemplates.put('content-hub',{name:'Unrelated'}, {...packets[0],name:'Unrelated',text:'Unrelated',document:[]});
  });
  await page.locator('#suite-content-hub-open').click();
  await page.waitForFunction(()=>document.querySelector('#ch-list').children.length===20);
  await page.locator('#ch-query').fill('Export');await page.locator('#ch-sort').selectOption('name');
  const download=page.waitForEvent('download');await page.locator('#ch-collection-export').click();
  const collection=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));
  assert.equal(collection.items.length,30);assert.equal(collection.items[0].name,'Export 00');assert.equal(collection.items.at(-1).name,'Export 29');
  assert.equal(collection.items[10].document.html,'<p>Exact 10</p>');
  await page.waitForFunction(()=>document.querySelector('#ch-collection-export').textContent==='Export filtered collection');
  await page.locator('#ch-select-filtered').click();
  const selectedDownload=page.waitForEvent('download');await page.locator('#ch-export-checked').click();
  const selected=JSON.parse(await fs.readFile(await (await selectedDownload).path(),'utf8'));assert.equal(selected.items.length,30);
  await page.waitForFunction(()=>document.querySelector('#ch-export-checked').textContent==='Export selected collection');
  await page.locator('#ch-query').fill('No matching content');await page.locator('#ch-collection-export').click();
  await page.waitForFunction(()=>document.querySelector('#ch-status').textContent.includes('nonempty'));
  assert.ok(await page.locator('#ch-collection-export').isEnabled());
  console.log('PASS: filtered export includes every matching page in view order, retains exact native data, skips unrelated snapshots and releases controls after failure.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
