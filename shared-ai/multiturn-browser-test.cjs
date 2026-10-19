const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const tool of ['textiX','architex','appiX']){
  const page=await browser.newPage(),requests=[];let action='question',name='First proposal';
  await page.route('**/api/chat',async route=>{
   const messages=route.request().postDataJSON().messages,request=JSON.parse(messages.at(-1).content);requests.push({messages,request});
   let proposal=null;
   if(action==='edit'){proposal=structuredClone(request.conversation.pendingProposal?.document||request.document);if(tool==='architex')proposal.metamodel.name=name;else proposal.name=name;}
   await route.fulfill({json:{text:JSON.stringify({requestId:request.requestId,documentDigest:request.documentDigest,answer:action==='question'?'A follow-up answer.':'Suggested changes.',summary:name,proposal})}});
  });
  await page.goto('http://localhost:8000/'+tool+'/');await page.locator('#sai-launch').click();
  async function send(task){await page.locator('#sai-prompt').fill(task);await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);}
  const original=await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot()));
  await send('Explain this document');assert.equal(await page.locator('#sai-status').textContent(),'Complete');
  action='edit';await send('Propose a rename');assert.equal(requests[1].messages.length,4);
  const initialId=requests[1].request.requestId;
  assert.equal(await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot())),original);
  action='question';await send('Explain your pending proposal');assert.equal(requests[2].request.conversation.pendingProposal.requestId,initialId);
  assert.equal(await page.locator('#sai-status').textContent(),'Complete');
  action='edit';name='Refined proposal';await send('Refine that proposal');
  assert.equal(requests[3].request.conversation.pendingProposal.document[tool==='architex'?'metamodel':'name']?.name||requests[3].request.conversation.pendingProposal.document.name,'First proposal');
  assert.equal(await page.getByRole('button',{name:'Proposal superseded',exact:true}).count(),1);
  await page.getByRole('button',{name:'Review proposed edit',exact:true}).click();await page.locator('#sai-apply').click();await page.locator('#sai-review').waitFor({state:'hidden'});
  action='question';await send('What has actually changed?');const after=requests.at(-1).request;
  assert.equal(tool==='architex'?after.document.metamodel.name:after.document.name,'Refined proposal');
  assert.equal(after.conversation.pendingProposal,null);assert.equal(after.conversation.proposals.at(-1).status,'applied');
  await page.locator('.sai-raw summary').click();await page.locator('#sai-undo').click();await send('Explain after undo');
  assert.equal(requests.at(-1).request.conversation.proposals.at(-1).status,'undone');
  assert.equal(await page.evaluate(()=>JSON.stringify(SuiteAgentAdapter.snapshot())),original);
  for(let i=0;i<6;i++)await send('Follow-up '+i);
  assert.ok(requests.at(-1).messages.length>12,'History must retain earlier turns');assert.match(requests.at(-1).messages[1].content,/Explain this document/);
  const conversationId=requests.at(-1).request.conversation.id;await page.locator('#sai-clear').click();await send('Fresh question');
  assert.equal(requests.at(-1).messages.length,2);assert.notEqual(requests.at(-1).request.conversation.id,conversationId);assert.deepEqual(requests.at(-1).request.conversation.proposals,[]);
  await page.close();console.log('PASS '+tool+': questions, pending proposal discussion/refinement, apply/undo state, full history and reset.');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
