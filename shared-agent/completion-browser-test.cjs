const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {agentControl}=require('./browser-tools.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();let resumed=0;
  const fixture={id:'partial-run',createdAt:new Date().toISOString(),goal:'Create a game',status:'complete',tool:'textiX',events:[{kind:'observation',value:{tool:'apply_project',ok:true,result:{}}},{kind:'assistant',value:{step:1,status:'done',plan:'Report limits',outcome:'partial',summary:'Game proposed; verification remains blocked.',tasks:[{id:'build',title:'Create game',status:'done'},{id:'verify',title:'Validate proposal',status:'blocked'}]}}]};
  await page.route('**/api/health',r=>r.fulfill({json:{agentHandoff:{mode:'off'}}}));
  await page.route('**/api/agent/health',r=>r.fulfill({json:{enabled:true,workspace:'/tmp/example',commands:[],tools:[]}}));
  await page.route('**/api/agent',r=>{const op=r.request().postDataJSON().op;if(op==='resume')resumed++;return r.fulfill({json:op==='list'?{sessions:[fixture]}:op==='session'?fixture:op==='changes'?{changes:[]}:{scripts:[]}});});
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(()=>SuiteCodingAgent.open());
  await agentControl(page,'#ag-sessions','selectOption','partial-run');await agentControl(page,'#ag-load','click');
  await page.locator('#ag-completion').waitFor();
  assert.match(await page.locator('#ag-completion h3').textContent(),/unfinished work/);
  assert.match(await page.locator('#ag-completion li').textContent(),/Validate proposal/);
  assert.ok(!(await page.locator('#ag-evidence').textContent()).includes('after the latest command'));
  assert.ok(!(await page.locator('#ag-evidence').getAttribute('class')||'').includes('ag-error'));
  await page.locator('#ag-goal').fill('Keep the existing game.');
  await page.locator('#ag-completion-followup').click();
  const goal=await page.locator('#ag-goal').inputValue();assert.match(goal,/Keep the existing game/);assert.match(goal,/Validate proposal/);assert.match(goal,/Do not mark unverified tasks done/);assert.equal(resumed,0);
  const chat=await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('suite-agent-result',{detail:{tool:'textiX',outcome:'partial',summary:'Verification pending',verification:[]}}));return SuiteChatConversation.snapshot().at(-1).text;});assert.match(chat,/partial; unfinished work remains/);
  await page.locator('#ag-completion-results').click();assert.equal(await page.locator('#ag-library-tab-results').getAttribute('aria-selected'),'true');
  console.log('PASS: loaded partial runs show blockers, honest evidence and actionable follow-up/results without executing or applying anything.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
