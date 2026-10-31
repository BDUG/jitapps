const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const page=await browser.newPage(),errors=[],requests=[];page.setDefaultTimeout(10000);let propose=false,invalid=false,partial=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/chat',async route=>{
  const body=route.request().postDataJSON();requests.push(body);
  const request=JSON.parse(body.messages.at(-1).content),proposal=propose?(partial?{metamodel:{components:structuredClone(request.document.metamodel.components)},instanceModel:{instances:structuredClone(request.document.instanceModel.instances)}}:structuredClone(request.document)):null;
  if(proposal){if(partial){proposal.metamodel.components[0].name='Updated component';proposal.instanceModel.instances[0].name='Updated instance';}else proposal.metamodel.name='Shared chat architecture';if(invalid)proposal.instanceModel.instances[0].componentId='missing-component';}
  await route.fulfill({json:{text:JSON.stringify({requestId:request.requestId,documentDigest:request.documentDigest,answer:'Architecture explained.',summary:'Rename architecture',proposal})}});
 });
 await page.goto((process.env.BASE_URL||'http://localhost:8000')+'/architex/');
 // This mock speaks the direct chat contract; paging envelopes have separate tests.
 await page.evaluate(()=>SuiteChatPaging.configure({mode:'off'}));
 assert.equal(await page.locator('#openChat').count(),0);await page.locator('#sai-launch').click();await page.locator('#sai-panel').waitFor({state:'visible'});
 async function send(text){await page.locator('#sai-prompt').fill(text);await page.locator('#sai-send').click();await page.waitForFunction(()=>!document.querySelector('#sai-send').disabled);}
 await send('Explain the architecture');
 assert.equal(requests.length,1);const request=JSON.parse(requests[0].messages.at(-1).content);
 assert.ok(request.document.metamodel.components.length);assert.ok(request.document.instanceModel.instances.length);assert.ok(request.document.ruleLibrary);
 assert.ok(request.contextSchema.schemas.instanceDataPoint);
 assert.deepEqual(request.modelSchemas.metamodel.required,['components','dependencies']);
 assert.deepEqual(request.modelSchemas.instanceModel.required,['instances','connections']);
 assert.ok(request.modelSchemas.metamodel.properties.components.items.properties.ports.items.properties.allowedComponentIds);
 assert.ok(request.modelSchemas.instanceModel.properties.instances.items.properties.ports.items.properties.definitionId);
 assert.deepEqual(request.proposalSchema.properties.metamodel.properties,request.modelSchemas.metamodel.properties);
 assert.deepEqual(request.proposalSchema.properties.instanceModel.properties,request.modelSchemas.instanceModel.properties);
 assert.equal(request.proposalSchema.properties.metamodel.allOf,undefined,'Chat schema must not require exchange wrappers');
 const schemaCheck=await page.evaluate(()=>{const doc=SuiteAgentAdapter.snapshot(),schemas=SuiteAgentAdapter.modelSchemas;Architex.checkSchema(doc.metamodel,schemas.metamodel);Architex.checkSchema(doc.instanceModel,schemas.instanceModel);try{const bad=structuredClone(doc);bad.instanceModel.instances[0].ports[0].direction='sideways';SuiteAgentAdapter.validate(bad);return false;}catch{return true;}});
 assert.equal(schemaCheck,true,'Invalid instance port direction must fail schema validation');

 assert.match(requests[0].messages[0].content,/Spec-Driven Development Handover/);
 await send('Follow up');assert.equal(requests[1].messages.length,4);
 await page.locator('#sai-clear').click();propose=true;await send('Rename architecture');
 assert.equal(requests[2].messages.length,2);
 await page.getByRole('button',{name:'Review proposed edit',exact:true}).click();await page.locator('#sai-apply').click();
 await page.locator('#sai-review').waitFor({state:'hidden'});
 assert.equal(await page.locator('#projectLabel').textContent(),'Shared chat architecture');
 await page.locator('.sai-raw > summary').click();await page.locator('#sai-undo').click();assert.equal(await page.locator('#projectLabel').textContent(),request.document.metamodel.name);
 partial=true;await send('Edit component and instance without resending unchanged collections');
 await page.getByRole('button',{name:'Review proposed edit',exact:true}).last().click();await page.locator('#sai-apply').click();await page.locator('#sai-review').waitFor({state:'hidden'});
 const adapted=await page.evaluate(()=>SuiteAgentAdapter.snapshot());
 assert.equal(adapted.metamodel.components[0].name,'Updated component');assert.equal(adapted.instanceModel.instances[0].name,'Updated instance');
 assert.deepEqual(adapted.metamodel.dependencies,request.document.metamodel.dependencies);assert.deepEqual(adapted.instanceModel.connections,request.document.instanceModel.connections);assert.deepEqual(adapted.ruleLibrary,request.document.ruleLibrary);
 await page.locator('#sai-undo').click();
 const renameOnly=await page.evaluate(()=>SuiteAgentAdapter.validate({metamodel:{name:'Name only'}}));
 assert.equal(renameOnly.metamodel.name,'Name only');assert.deepEqual(renameOnly.instanceModel,request.document.instanceModel);
 const rejected=await page.evaluate(()=>{try{SuiteAgentAdapter.validate({metamodel:{components:[]}});return false;}catch{return true;}});
 assert.equal(rejected,true,'Explicit deletions must not silently restore referenced components');
 invalid=true;await send('Invalid reference');
 assert.equal(await page.locator('#sai-status').textContent(),'Needs attention');assert.ok(await page.getByRole('heading',{name:'Content was not updated',exact:true}).count());
 assert.equal(await page.locator('#projectLabel').textContent(),request.document.metamodel.name);
 assert.deepEqual(errors,[]);
 // Shared integration remains compatible with a synchronous document adapter.
 await page.goto((process.env.BASE_URL||'http://localhost:8000')+'/textiX/');await page.evaluate(()=>SuiteChatPaging.configure({mode:'off'}));propose=false;await page.locator('#sai-launch').click();await send('Explain document');assert.equal(await page.locator('#sai-status').textContent(),'Complete');
 console.log('PASS: shared launch, models/rules/schemas/template context, follow-up/reset, reviewed apply/undo, invalid reference rejection and textiX compatibility.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
