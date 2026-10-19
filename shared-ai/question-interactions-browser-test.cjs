const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:430,height:800}}),requests=[];
 await page.route('**/api/chat',async route=>{
  const request=JSON.parse(route.request().postDataJSON().messages.at(-1).content);requests.push(request);
  if(requests.length===2)return route.abort('failed');
  const questions=requests.length===1?[
   {id:'choice',text:'Choose layout',options:['Compact','Spacious']},
   {id:'features',text:'Choose features',multiple:true,options:['Search','Filter']},
   {id:'notes',text:'Additional notes',optional:true}
  ]:requests.length===3?[{id:'choice',text:'Follow-up choice',options:['Keep','Change']}]:[];
  await route.fulfill({json:{text:JSON.stringify({requestId:request.requestId,documentDigest:request.documentDigest,answer:'Continue the discussion.',questions,proposal:null})}});
 });
 await page.goto('http://localhost:8000/textiX/');await page.locator('#sai-launch').click();
 async function send(){await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);}
 await page.locator('#sai-prompt').fill('Help refine this document');await send();
 const first=page.locator('.sai-card-question').nth(0),multi=page.locator('.sai-card-question').nth(1),notes=page.locator('.sai-card-question').nth(2);
 await first.getByRole('radio',{name:'Compact',exact:true}).check();await first.getByRole('button',{name:'Use answer'}).click();await first.getByRole('button',{name:'Use answer'}).click();assert.equal(await page.locator('.sai-queued-answer').count(),1,'No duplicate answers');
 await first.getByRole('radio',{name:'Spacious',exact:true}).check();assert.match(await page.locator('#sai-answer-queue').textContent(),/Spacious/);
 await multi.getByRole('checkbox',{name:'Search',exact:true}).check();await multi.getByRole('checkbox',{name:'Filter',exact:true}).check();await multi.getByRole('textbox').fill('Keyboard shortcuts');await multi.getByRole('button',{name:'Use answer'}).click();
 await notes.getByRole('textbox').fill('Unsubmitted note draft');
 assert.equal(await page.locator('#sai-prompt').inputValue(),'');await send();
 assert.equal(requests[1].answers.length,2);assert.equal(requests[1].answers[0].answer,'Spacious');assert.match(requests[1].answers[1].answer,/Search; Filter; Keyboard shortcuts/);
 assert.equal(await page.locator('.sai-queued-answer').count(),2,'Failed request retains answers');assert.equal(await first.getByRole('radio',{name:'Spacious',exact:true}).isChecked(),true);assert.equal(await notes.getByRole('textbox').inputValue(),'Unsubmitted note draft');
 await send();assert.equal(await page.locator('.sai-queued-answer').count(),0);assert.equal(await page.getByRole('button',{name:'Revise answer',exact:true}).count(),2);
 assert.equal(await notes.getByRole('textbox').inputValue(),'Unsubmitted note draft','New turn preserves draft');
 await first.getByRole('button',{name:'Revise answer'}).click();await first.getByRole('radio',{name:'Compact',exact:true}).check();await first.getByRole('button',{name:'Use answer'}).click();
 const follow=page.locator('.sai-card-question').nth(3);await follow.getByRole('radio',{name:'Keep',exact:true}).check();await follow.getByRole('button',{name:'Use answer'}).click();await notes.getByRole('button',{name:'Skip question'}).click();
 await send();assert.equal(requests[3].answers.length,3);const reused=requests[3].answers.filter(answer=>answer.questionId==='choice');assert.equal(reused.length,2);assert.notEqual(reused[0].sourceRequestId,reused[1].sourceRequestId);assert.ok(requests[3].answers.find(answer=>answer.skipped));
 assert.equal(await notes.locator('.sai-sent-answer').textContent(),'You skipped this question.');
 await page.locator('#sai-clear').click();assert.equal(await page.locator('.sai-card-question').count(),0);assert.equal(await page.locator('.sai-queued-answer').count(),0);
 console.log('PASS: deduplicated answer queue, multi-select/custom answers, failure retry, preserved drafts, answer revisions, repeated IDs, optional skip and reset.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
