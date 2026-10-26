'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:8031';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[],googleRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/accounts\.google\.com|googleapis\.com\/(?:drive|oauth2|upload|v1\/documents)/.test(r.url()))googleRequests.push(r.url());});
 await page.addInitScript(()=>{for(const id of ['desktop','textiX','sheetiX','presentiX','colabriX'])localStorage.setItem('suite-export-destination-'+id,'drive');});
 for(const app of ['', 'textiX/', 'sheetiX/', 'presentiX/', 'colabriX/']){
  await page.goto(base+'/'+app);await page.waitForFunction(()=>window.SuiteDiskUI);assert.equal(await page.evaluate(()=>SuiteDiskUI.getDestination()),'computer','Retired Drive preference falls back to local downloads');
  assert.equal(await page.locator('#desktop-google,#importGoogle,#exportGoogle,#collaborate,#suite-load-drive,#sd-drive,#sd-save-drive,#pz-drive-load,#pz-drive-save').count(),0);
  assert.equal(await page.evaluate(()=>typeof SuiteDiskUI.googleDrive),'undefined');assert.equal(await page.evaluate(()=>typeof SuiteDiskUI.googleAccount),'undefined');
  if(app){assert.equal(await page.locator('#suite-export-target option[value=drive],#pz-destination option[value=drive]').count(),0);}
  await page.locator(app?'#suite-disk-open':'#desktop-disk').click();await page.locator('#suite-disk-dialog').waitFor({state:'visible'});assert.ok(await page.locator('#sd-upload').isVisible());await page.locator('#sd-close').click();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(googleRequests,[]);console.log('PASS local file UI: no Google login/Drive actions or network calls, retired destination migration, and virtual disk available on desktop and office/board apps.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
