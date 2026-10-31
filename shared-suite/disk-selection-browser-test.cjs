const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const Zip=require('../architex/vendor/jszip.min.js');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   await SuiteDisk.write('chosen/nested/bytes.bin',new Blob([new Uint8Array([0,255,9])]));
   await SuiteDisk.mkdir('chosen/empty');
   await SuiteDisk.write('other/unselected.txt',new Blob(['Do not include']));
   const original=SuiteDisk.all;SuiteDisk.all=()=>{throw Error('Download must not read the entire disk');};
   const selection=await SuiteDisk.readSelection(['chosen','chosen/nested/bytes.bin']);
   if(new Set(selection.map(e=>e.path)).size!==selection.length)throw Error('Duplicate selected paths');
   let rejected=false;try{await SuiteDisk.readSelection(['missing']);}catch{rejected=true;}if(!rejected)throw Error('Missing selection was silently ignored');
   window.originalAll=original;
  });
  await page.locator('#suite-disk-open').click();
  await page.getByRole('checkbox',{name:'Select chosen',exact:true}).check();
  const download=page.waitForEvent('download');await page.locator('#sd-download').click();
  const archive=await Zip.loadAsync(await fs.readFile(await (await download).path()));
  assert.deepEqual([...await archive.file('chosen/nested/bytes.bin').async('uint8array')],[0,255,9]);
  assert.ok(archive.file('other/unselected.txt')===null);assert.ok(archive.files['chosen/empty/'].dir);
  await page.waitForFunction(()=>document.querySelector('#sd-download').textContent==='Download selected');
  assert.ok(await page.locator('#sd-download').isEnabled());
  await page.evaluate(()=>{SuiteDisk.readSelection=async()=>{throw Error('Storage read failed');};});
  await page.locator('#sd-download').click();
  await page.waitForFunction(()=>document.querySelector('#sd-status').textContent==='Storage read failed');
  assert.equal(await page.locator('#sd-download').textContent(),'Download selected');
  assert.ok(await page.locator('#sd-download').isEnabled());
  console.log('PASS: selected-only archives preserve binary data/empty folders, deduplicate paths, reject missing files and recover controls after failure.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
