const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.route('http://window.test/**',route=>route.fulfill({contentType:'text/html',body:'<main style="height:800px"><aside id="agent" style="width:400px;height:500px"><header class="sai-head"></header></aside></main>'}));
 await page.goto('http://window.test/');
 await page.addScriptTag({path:__dirname+'/window.js'});
 await page.evaluate(()=>{window.control=SuiteAgentWindow.mount(document.querySelector('#agent'),{docked:true});control.resize(400,500);});
 await page.getByRole('button',{name:'Expand or restore chat window'}).click();
 assert.equal(await page.getByRole('button',{name:'Expand or restore chat window'}).textContent(),'Restore');
 await page.getByRole('button',{name:'Float or dock the assistant window'}).click();
 assert.equal(await page.getByRole('button',{name:'Expand or restore chat window'}).textContent(),'Expand');
 await page.getByRole('button',{name:'Float or dock the assistant window'}).click();
 await page.evaluate(()=>control.resize(400,500));
 // Pointer moves in one frame must not cause one layout pass per event.
 const metrics=await page.evaluate(()=>{
 const shell=document.querySelector('#agent'),handle=shell.querySelector('.suite-agent-resize-side');
 let reads=0;const original=shell.getBoundingClientRect.bind(shell);
 shell.getBoundingClientRect=()=>{reads++;return original();};
 handle.setPointerCapture=()=>{};
 handle.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:500,clientY:300,pointerId:1}));
 for(let x=499;x>=400;x--)handle.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:300,pointerId:1}));
 const before=reads;
 handle.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
 return {before,after:reads,width:JSON.parse(localStorage.getItem('suite-agent-window-v1:/')).geometry.width};
 });
 assert.equal(metrics.before,1);assert.equal(metrics.after,2);assert.equal(metrics.width,500);
 await page.setViewportSize({width:600,height:500});
 await page.waitForTimeout(50);
 assert.ok(await page.locator('#agent').evaluate(el=>el.getBoundingClientRect().width<=584));
 await page.getByRole('button',{name:'Reset chat window size'}).click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('suite-agent-window-v1:/')),null);
 console.log('PASS shared assistant resizing: coalesced pointer updates, final geometry, control labels, viewport clamp and reset');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
