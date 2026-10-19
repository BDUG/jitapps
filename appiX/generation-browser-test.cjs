const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1600,height:1050}});await page.goto('http://127.0.0.1:8010/appiX/');await page.evaluate(()=>localStorage.clear());await page.reload();await page.locator('#brief').fill('tetris game');await page.locator('#askAI').click();assert.equal(await page.locator('#sai-prompt').inputValue(),'tetris game');assert.equal(await page.locator('#sai-mode').inputValue(),'build');
const before=await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot()));let request,answerMode='build';
await page.route('**/api/chat',async route=>{
 const messages=route.request().postDataJSON().messages;request=JSON.parse(messages.at(-1).content);assert.equal(request.task,'tetris game');
 if(answerMode==='question'){assert.equal(request.intent,'question');return route.fulfill({json:{text:JSON.stringify({answer:'The app uses keyboard controls.',proposal:null})}});}
 assert.equal(request.intent,'build');assert.match(messages[0].content,/short phrase.*complete working app/);assert.equal(request.document.brief,'tetris game');
 if(answerMode==='no-app')return route.fulfill({json:{text:'You can build Tetris with a canvas and JavaScript.'}});
 if(answerMode==='bad-id')return route.fulfill({json:{text:JSON.stringify({requestId:'wrong',documentDigest:request.documentDigest,proposal:{name:'Bad'}})}});
 assert.equal(messages.some(m=>m.content.includes('Request failed:')),false);
 const proposal={name:'Tetris',brief:'tetris game',html:'<main><h1>Tetris</h1><button id="start">Start game</button><output id="score">Ready</output></main>',css:'body{font:20px system-ui}',js:'document.querySelector("#start").onclick=()=>document.querySelector("#score").textContent="Game started";'};
 // Valid proposals often arrive with prose around a Markdown JSON block.
 return route.fulfill({json:{text:'Here is your app.\n```json\n'+JSON.stringify({requestId:request.requestId,documentDigest:request.documentDigest,answer:'Built the requested game.',summary:'Replace the starter',proposal})+'\n```\nReview before running.'}});
});
answerMode='no-app';await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);assert.match(await page.locator('#sai-messages').textContent(),/No app was generated/);assert.equal(await page.locator('#sai-prompt').inputValue(),'tetris game');
answerMode='build';await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);assert.equal(await page.locator('#sai-messages button').count(),1);assert.equal(await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot())),before);await page.locator('#sai-messages button').click();await page.locator('#sai-apply').click();assert.equal(await page.locator('#name').inputValue(),'Tetris');assert.equal(await page.locator('#frame').isVisible(),false);await page.locator('#sai-close').click();await page.locator('#preview').click();await page.frameLocator('#frame').locator('#start').click();assert.equal(await page.frameLocator('#frame').locator('#score').textContent(),'Game started');
await page.locator('#sai-launch').click();answerMode='bad-id';await page.locator('#sai-prompt').fill('tetris game');await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);assert.match(await page.locator('#sai-messages').textContent(),/identifiers do not match/);
answerMode='question';await page.locator('#sai-mode').selectOption('question');await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);assert.match(await page.locator('#sai-messages').textContent(),/keyboard controls/);
console.log('PASS: short app brief requests generation; explanation-only answers fail clearly; fenced proposals review/apply/run; wrong identifiers are rejected; question mode remains available (mock provider).');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
