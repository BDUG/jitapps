const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1550,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/mindiX/');
 await page.evaluate(async()=>{
  await SuiteDisk.write('map.json',new Blob([JSON.stringify(SuiteAgentAdapter.snapshot())],{type:'application/json'}));
  const c=document.createElement('canvas');c.width=c.height=40;c.getContext('2d').fillRect(0,0,40,40);
  await SuiteDisk.write('topic.png',await(await fetch(c.toDataURL())).blob());
 });
 await page.locator('#open').click();await page.locator('#suite-load-cancel').click();
 assert.equal(await page.locator('#suite-load-source').evaluate(e=>e.open),false);
 await page.locator('#open').click();
 const chooser=page.waitForEvent('filechooser');await page.locator('#suite-load-local').click();await chooser;
 await page.locator('#open').click();await page.locator('#suite-load-virtual').click();
 assert.equal(await page.locator('#sd-import-target').inputValue(),'file');
 await page.locator('#sd-list [data-path="map.json"]').click();await page.locator('#sd-import').click();
 await page.locator('#outline [data-topic="discover"]').click();
 await page.locator('#topicImage').click();await page.locator('#suite-load-virtual').click();
 assert.equal(await page.locator('#sd-import-target').inputValue(),'topicImage');
 await page.locator('#sd-list [data-path="topic.png"]').click();await page.locator('#sd-import').click();
 await page.locator('#topics [data-topic="discover"] image').waitFor();
 await page.locator('#sai-launch').click();
 // All file inputs, including chat and anonymous dynamic inputs, are discovered.
 await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.setAttribute('aria-label','Dynamic attachment');document.body.append(input);input.click();});
 await page.locator('#suite-load-virtual').click();
 assert.ok((await page.locator('#sd-import-target option').allTextContents()).includes('Dynamic attachment'));
 await page.locator('#sd-close').click();
 await page.goto('http://127.0.0.1:8000/architex/relay.html');
 await page.locator('#file').evaluate(e=>e.click());await page.locator('#suite-load-virtual').click();
 assert.equal(await page.locator('#sd-import-target').inputValue(),'file');
 assert.deepEqual(errors,[]);console.log('PASS: local picker, cancel, virtual map/image loading, dynamic readers, relay config reader.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
