const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/mockiX/');await page.waitForFunction(()=>window.MockixApp&&document.querySelector('.brand .suite-app-icon')?.complete);
 const before=await page.evaluate(()=>JSON.stringify(MockixApp.snapshot()));
 assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).getPropertyValue('--tlal-maroon').trim()),'#8b1e3f');assert.match(await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Inter/);
 assert.equal(await page.locator('#preview').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(139, 30, 63)');assert.equal(await page.locator('.brand-name span').textContent(),'X');assert.equal(await page.locator('.brand').getAttribute('href'),'./');
 assert.equal(await page.locator('.brand .suite-app-icon').count(),1);assert.ok(await page.locator('.brand .suite-app-icon').evaluate(e=>e.naturalWidth===64&&getComputedStyle(e).width==='37px'));
 const icon=await page.request.get((process.env.BASE_URL||'http://127.0.0.1:8013')+'/assets/icons/mockiX.svg');const svg=await icon.text();assert.match(svg,/rx="30"/);assert.match(svg,/#3F6F98/);assert.ok(!svg.includes('#6554c0'));
 await page.screenshot({path:'/tmp/mockix-brand-desktop.png'});await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.brand').isVisible());await page.screenshot({path:'/tmp/mockix-brand-mobile.png'});assert.equal(await page.evaluate(()=>JSON.stringify(MockixApp.snapshot())),before);assert.deepEqual(errors,[]);
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/');const desktopIcon=page.locator('.desktop-app[href*="mockiX"] img');await desktopIcon.waitFor();assert.ok((await desktopIcon.getAttribute('src')).includes('mockiX.svg?v=tlal-mockix-20261031'));await page.waitForFunction(()=>document.querySelector('.desktop-app[href*="mockiX"] img')?.naturalWidth===64);
 console.log('PASS: mockiX shared TLAL tokens/Inter typography, maroon controls, consistent X wordmark and circular suite icon, mobile header and unchanged mockup document.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
