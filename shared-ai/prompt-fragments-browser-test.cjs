const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const routes=['vidiX/','architex/','graphiX/','textiX/','sheetiX/','codeiX/','appiX/','automatextiX/','reportiX/','presentiX/','sketchiX/','sketchiX/sketch.html','sketchiX/shape.html','mindiX/','projectiX/'];
 for(const path of routes){const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let requests=0;page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/chat',route=>{requests++;return route.abort();});
  await page.goto('http://localhost:8000/'+path);const code=path==='codeiX/';if(!code)await page.locator('#sai-launch').click();const input=page.locator(code?'#prompt':'#sai-prompt');
  await page.locator('.suite-prompts summary').click();assert.ok(await page.locator('.suite-prompt-list button').count()>=6,path+' domain and shared fragments');
  await input.fill('My requested change');const domain=page.locator('.suite-prompt-list button').first(),fragment=await domain.getAttribute('title');await domain.click();assert.equal(await input.inputValue(),'My requested change\n\n'+fragment);
  await page.getByRole('button',{name:'Preserve existing work',exact:true}).click();assert.match(await input.inputValue(),/Preserve unrelated content/);assert.equal(requests,0,'Fragments must never send a request');
  // Insertion at the cursor replaces only the selected text.
  await input.fill('Before SELECT After');await input.evaluate(element=>element.setSelectionRange(7,13));await domain.click();assert.equal(await input.inputValue(),'Before '+fragment+' After');
  assert.deepEqual(errors,[],path);await page.close();console.log('PASS '+path+': domain fragments, preserved draft, cursor insertion and no automatic request.');
 }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
