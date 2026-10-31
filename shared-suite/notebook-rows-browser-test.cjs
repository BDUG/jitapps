const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.waitForFunction(()=>window.SuiteNotebook);
  await page.evaluate(()=>{
   const notebook=SuiteNotebookCore.empty('textiX');
   notebook.tasks=[{id:'one',text:'First',done:false},{id:'two',text:'Second',done:false}];
   localStorage.setItem('suite-notebook-v1:textiX',JSON.stringify(notebook));SuiteNotebook.open();
   window.originalTask=document.querySelector('#nb-tasks input[type=text],#nb-tasks input:not([type])');
  });
  const inputs=page.getByRole('textbox',{name:'Task text',exact:true});
  await inputs.first().fill('Renamed first');
  assert.equal(await page.getByRole('checkbox',{name:'Complete task Renamed first',exact:true}).count(),1);
  await page.locator('#nb-task').fill('Third');await page.locator('#nb-add button').click();
  assert.ok(await page.evaluate(()=>originalTask===document.querySelector('#nb-tasks .nb-task-row').querySelectorAll('input')[1]));
  await page.locator('#nb-save').click();
  await page.getByRole('checkbox',{name:'Complete task Renamed first',exact:true}).check();
  await page.locator('#nb-save').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('suite-notebook-v1:textiX')).tasks[0].done),true);
  await page.getByRole('checkbox',{name:'Complete task Renamed first',exact:true}).uncheck();
  await page.locator('#nb-save').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('suite-notebook-v1:textiX')).tasks[0].done),false);
  await page.getByRole('button',{name:'Remove task Second',exact:true}).click();
  assert.equal(await inputs.count(),2);
  assert.ok(await inputs.last().evaluate(el=>el===document.activeElement));
  assert.match(await page.locator('#nb-count').textContent(),/2 unfinished \/ 2 tasks/);
  assert.ok(await page.evaluate(()=>originalTask.isConnected));
  console.log('PASS: notebook task rows survive add/save, labels follow renames, saved handlers use current tasks and removal preserves keyboard focus.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
