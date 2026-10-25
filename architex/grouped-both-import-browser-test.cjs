const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://localhost:8000/architex/');const original=await page.evaluate(()=>ArchitexIO.getModel());
 assert.equal(await page.evaluate(()=>ArchitexScope.version),2);assert.match(await page.locator('script[src^="exchange-scope.js"]').getAttribute('src'),/\?v=/);
 for(const activeTab of ['metamodel','instances']){
  await page.locator('[data-mode="'+activeTab+'"]').click();await page.locator('#import').click();await page.locator('#exchangeModel').selectOption('both');
  await page.locator('#file').setInputFiles(path.join(__dirname,'examples/cause-effect-grouped.md'));await page.locator('#ioDialog').waitFor({state:'hidden'});
  const result=await page.evaluate(()=>({model:ArchitexIO.getModel(),issues:Architex.inspect(ArchitexIO.getModel()),kind:ArchitexScope.kind(ArchitexIO.getModel())}));
  assert.equal(result.kind,'both');assert.equal(result.model.name,'Service feedback chain');assert.equal(result.model.components.length,6);assert.equal(result.model.instances.length,6);assert.equal(result.model.connections.length,7);assert.deepEqual(result.issues,[]);assert.equal(result.model.components.find(c=>c.id==='Demand').parentId,'service');
  await page.keyboard.press('Control+z');assert.deepEqual(await page.evaluate(()=>ArchitexIO.getModel()),original);
 }
 // Changing the selector while the file is being read must not change the operation's scope.
 await page.evaluate(()=>{const read=parseImportFile;parseImportFile=async(file,type)=>{window.pendingImportType=type;await new Promise(resolve=>window.releaseImport=resolve);return read(file,type);};});
 await page.locator('#import').click();await page.locator('#exchangeModel').selectOption('both');await page.locator('#file').setInputFiles(path.join(__dirname,'examples/cause-effect-grouped.md'));await page.waitForFunction(()=>window.pendingImportType==='both');await page.locator('#exchangeModel').selectOption('instances');await page.evaluate(()=>window.releaseImport());await page.locator('#ioDialog').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>ArchitexIO.getModel().components.length),6);assert.equal(await page.locator('#exchangeModel').inputValue(),'both');assert.deepEqual(errors,[]);
 console.log('PASS: exact grouped Markdown Both-model import from either tab, versioned scope assets, complete scope detection, valid ports, combined Undo and stable asynchronous import scope.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
