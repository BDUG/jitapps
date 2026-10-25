const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:700}});let calls=0;
 await page.route('**/api/chat',async route=>{
  calls++;const request=JSON.parse(route.request().postDataJSON().messages.at(-1).content);
  if(calls===2){assert.match(request.task,/Which layout\?/);assert.match(request.task,/My answer: Compact/);assert.match(request.task,/My answer: My own choice/);}
  await route.fulfill({json:{text:JSON.stringify({requestId:request.requestId,documentDigest:request.documentDigest,answer:'## Design update\nLet us **clarify** the design.\n- Preserve content\n- Improve readability\n<img src=x onerror=window.injected=true>',intent:'Improve document readability',plan:['Review existing sections','Propose focused edits'],assumptions:['The current audience is unchanged'],verification:['Check headings and references after applying'],nextSteps:['Choose a layout below'],proposal:null,feedback:[{kind:'info',title:'Design feedback',text:'The content is ready for review.'}],comments:[{title:'Editorial comment',text:'Preserve existing sections.'}],questions:[{id:'layout',text:'Which layout?',options:[{label:'Compact',description:'Keep related items close together.',recommended:true},{label:'Spacious',description:'More room between sections.'}]},{id:'other',text:'Any other preference?',options:[]}]})}});
 });
 await page.goto('http://localhost:8000/textiX/');await page.locator('#sai-launch').click();const before=await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot()));
 await page.locator('#sai-prompt').fill('Help improve this document');await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);
 for(const heading of ['Intent','Proposed approach','Assumptions','Suggested verification','Next steps','Editorial comment'])assert.equal(await page.getByRole('heading',{name:heading,exact:true}).count(),1);
 assert.equal(await page.locator('.sai-answer h4').textContent(),'Design update');
 assert.equal(await page.locator('.sai-answer b').textContent(),'clarify');
 assert.equal(await page.locator('.sai-answer li').count(),2);
 assert.equal(await page.locator('.sai-answer img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
 assert.equal(await page.locator('.sai-card-question').count(),2);assert.equal(await page.locator('.sai-card-comment').count(),1);assert.equal(await page.getByRole('heading',{name:'Design feedback',exact:true}).count(),1);
 await page.getByRole('radio',{name:'Compact (Recommended)',exact:false}).check();await page.locator('.sai-card-question').first().getByRole('button',{name:'Use answer'}).click();
 await page.getByRole('textbox',{name:'Your answer: Any other preference?',exact:true}).fill('My own choice');await page.locator('.sai-card-question').last().getByRole('button',{name:'Use answer'}).click();
 assert.equal(calls,1,'Options must not send or apply automatically');await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);
 assert.equal(calls,2);assert.equal(await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot())),before);
 assert.equal(await page.getByRole('button',{name:'Ask AI to repair result',exact:true}).count(),0);
 console.log('PASS: highlighted feedback/comments, accessible option questions, custom/composed answers, explicit send and unchanged document.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
