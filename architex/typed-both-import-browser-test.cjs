const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://localhost:8000/architex/');
 const empty=await page.evaluate(()=>({...ArchitexIO.getModel(),components:[],dependencies:[],instances:[],connections:[]})),partial=structuredClone(empty);partial.components=[{id:'service',name:'Existing service',category:'',description:'Keep this description',parentId:null,color:'#123456',x:0,y:0,parameters:{owner:'Ada'},ports:[]}];
 for(const fixture of [empty,partial]){
  await page.evaluate(value=>ArchitexIO.applyImportedModel(value,'both'),fixture);await page.locator('#import').click();await page.locator('#exchangeModel').selectOption('both');await page.locator('#file').setInputFiles(path.join(__dirname,'examples/cause-effect-instances.mmd'));await page.locator('#ioDialog').waitFor({state:'hidden'});
  const result=await page.evaluate(()=>({model:ArchitexIO.getModel(),issues:Architex.inspect(ArchitexIO.getModel())}));assert.equal(result.model.components.length,2);assert.equal(result.model.instances.length,2);assert.equal(result.model.connections.length,1);assert.deepEqual(result.issues,[]);
  const gateway=result.model.components.find(c=>c.id==='gateway'),service=result.model.components.find(c=>c.id==='service');assert.equal(gateway.ports[0].direction,'out');assert.equal(service.ports[0].direction,'in');assert.ok(gateway.ports[0].allowedComponentIds.includes('service'));assert.ok(service.ports[0].allowedComponentIds.includes('gateway'));
  if(fixture.components.length){assert.equal(service.description,'Keep this description');assert.equal(service.parameters.owner,'Ada');}
  await page.keyboard.press('Control+z');assert.deepEqual(await page.evaluate(()=>ArchitexIO.getModel()),fixture);
 }
 assert.deepEqual(errors,[]);console.log('PASS: exact typed Mermaid example imports Both models against empty/partial metamodels, creates valid policies/data ports, preserves existing content and supports Undo.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
