const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   for(let i=0;i<125;i++)await SuiteDisk.write('file-'+String(i).padStart(3,'0')+'.txt',new Blob(['Content '+i],{type:'text/plain'}));
   const original=SuiteDisk.list;window.diskReads=0;
   SuiteDisk.list=(...args)=>{diskReads++;return original(...args);};
  });
  await page.locator('#suite-disk-open').click();
  await page.waitForFunction(()=>document.querySelector('#sd-page-range').textContent==='1–100 of 125 items');
  assert.equal(await page.locator('#sd-list .sd-row').count(),100);
  await page.getByRole('checkbox',{name:'Select file-000.txt',exact:true}).check();
  const reads=await page.evaluate(()=>diskReads);
  await page.locator('#sd-page-next').click();
  assert.equal(await page.locator('#sd-list .sd-row').count(),25);
  await page.getByRole('checkbox',{name:'Select file-124.txt',exact:true}).check();
  assert.equal(await page.locator('#sd-selection-count').textContent(),'2 selected in this folder');
  await page.locator('#sd-page-prev').click();
  assert.ok(await page.getByRole('checkbox',{name:'Select file-000.txt',exact:true}).isChecked());
  assert.equal(await page.evaluate(()=>diskReads),reads);
  assert.equal(await page.locator('#sd-list').getAttribute('aria-busy'),'false');
  assert.ok(await page.locator('#sd-loading').isHidden());
  console.log('PASS: virtual disk pages without storage rereads, preserves cross-page selections, and clears its loading state.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
