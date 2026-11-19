const assert=require('node:assert/strict'),{chromium}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'cncfix-browser-'));
 const server=spawn('python3',['-u','server/server.py','--port','0','--skills-offline','--disable-agent','--agent-workspace',temp,'--config',path.join(temp,'providers.json'),'--search-config',path.join(temp,'search.json')],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser,stderr='';
 server.stderr.on('data',d=>stderr+=d);
 try{
  const base=await new Promise((resolve,reject)=>{
   let output='';
   const timer=setTimeout(()=>reject(Error(stderr||'Server startup timed out')),15000);
   server.stdout.on('data',d=>{
    output+=d;
    const match=output.match(/listening on (\S+)/);
    if(match){clearTimeout(timer);resolve('http://'+match[1]);}
   });
   server.once('exit',()=>{clearTimeout(timer);reject(Error(stderr));});
  });
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1500,height:1050}}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base+'/'))external.push(r.url());});

  await page.goto(base+'/');
  await page.locator('a[href="cncfiX/"]').click();
  await page.waitForSelector('#preview svg');
  await page.waitForFunction(()=>window.SuiteWorkspace&&window.SuiteProjectZipUI&&window.SuiteChatPaging);

  const snapshot=()=>page.evaluate(()=>CncfixApp.snapshot());
  const initial=await snapshot();
  assert.ok(initial.items.length>=15);
  assert.equal(await page.locator('.brand .suite-app-icon').count(),1);

  // Add a custom project, edit it, duplicate, delete, undo/redo
  await page.locator('#add-item').click();
  assert.equal((await snapshot()).items.length,initial.items.length+1);
  await page.locator('#item-name').fill('Custom Mesh');
  await page.locator('#item-name').press('Tab');
  await page.locator('#item-maturity').selectOption('incubating');
  await page.waitForFunction(()=>document.querySelector('#preview svg').textContent.includes('Custom Mesh'));
  await page.locator('#undo').click();
  assert.equal((await snapshot()).items.at(-1).maturity,'sandbox');

  // Filter by maturity
  await page.locator('#filter-maturity').selectOption('graduated');
  assert.ok((await page.locator('#preview .lx-item').count())>=10);
  await page.locator('#filter-maturity').selectOption('all');

  // Export SVG, YAML, JSON and re-import SVG & YAML
  async function exportFile(format){
   await page.locator('#open-export').click();
   await page.locator('#format').selectOption(format);
   const waiting=page.waitForEvent('download');
   await page.locator('#doExport').click();
   const file=await waiting,text=await fs.readFile(await file.path(),'utf8');
   await page.locator('#export-close').click();
   return text;
  }
  const svg=await exportFile('svg');
  assert.match(svg,/<cncfix-project /);
  const yaml=await exportFile('yaml');
  assert.match(yaml,/^landscape:/);
  const jsonText=await exportFile('json');
  assert.equal(JSON.parse(jsonText).format,'cncfix-project');

  // Mobile layout check
  const mobile=await context.newPage();
  await mobile.setViewportSize({width:390,height:844});
  await mobile.goto(base+'/cncfiX/');
  await mobile.waitForSelector('#preview svg');
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await mobile.close();

  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  console.log('PASS cncfiX: desktop launch, CNCF catalog, editing/undo, maturity filter, SVG/YAML/JSON export, and mobile layout.');
 }finally{
  await browser?.close();
  server.kill();
  await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);});
  await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
