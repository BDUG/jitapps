const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();let calls=0;
 await page.route('**/api/chat',async route=>{
  const request=JSON.parse(route.request().postDataJSON().messages.at(-1).content);calls++;
  const result={requestId:request.requestId,documentDigest:request.documentDigest,answer:'Here is the requested document update.',summary:'Update document',proposal:{name:'Updated document',html:'<h1>Updated content</h1>'}};
  let text;
  if(calls===1){result.proposal={html:12};text=JSON.stringify(result);}
  else if(calls===2){assert.ok(request.conversation.lastResultFeedback.error);text='Explanation with reference JSON:\n```json\n{"example":"reference only"}\n```\nActual response:\n```json\n'+JSON.stringify(result)+'\n```';}
  else {result.documentDigest='wrong-digest';text=JSON.stringify(result);}
  await route.fulfill({json:{text}});
 });
 await page.goto('http://localhost:8000/textiX/');await page.locator('#sai-launch').click();
 const before=await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot()));
 async function send(){await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);}
 await page.locator('#sai-prompt').fill('Update document');await send();
 assert.equal(await page.locator('#sai-status').textContent(),'Needs attention');
 assert.match(await page.locator('#sai-messages').textContent(),/Here is the requested document update/);
 assert.equal(await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot())),before);
 assert.equal(await page.getByRole('button',{name:'Ask AI to repair result',exact:true}).count(),0);
 assert.ok(await page.getByRole('heading',{name:'Content was not updated',exact:true}).count());
 await page.locator('#sai-prompt').fill('Please correct the proposed edit.');
 await send();await page.getByRole('button',{name:'Review proposed edit',exact:true}).click();
 assert.match(await page.locator('#sai-changes').textContent(),/html: updated/);
 await page.locator('#sai-apply').click();await page.locator('#sai-review').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>SuiteAgentAdapter.snapshot().name),'Updated document');
 await page.locator('#sai-prompt').fill('Another update');await send();
 assert.equal(await page.locator('#sai-status').textContent(),'Needs attention');
 assert.match(await page.locator('#sai-messages').textContent(),/identifiers do not match/);
 console.log('PASS: answer retained on invalid edit, repair request, mixed JSON blocks, reviewed content update, mismatched identifiers rejected.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
