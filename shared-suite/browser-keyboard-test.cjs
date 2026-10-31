const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(async()=>{
   for(const name of ['one.txt','two.txt','very-long-'.repeat(12)+'.txt'])await SuiteDisk.write(name,new Blob(['Contents']));
   await SuiteDisk.write('parent/child.txt',new Blob(['Nested']));
  });
  await page.locator('#suite-disk-open').click();await page.waitForFunction(()=>document.querySelector('#sd-list').getAttribute('aria-busy')==='false');
  await page.keyboard.press('Control+f');assert.ok(await page.locator('#sd-search').evaluate(el=>el===document.activeElement));
  await page.locator('#sd-search').fill('.txt');await page.locator('#sd-search').press('ArrowDown');
  assert.ok(await page.locator('#sd-list .sd-entry').first().evaluate(el=>el===document.activeElement));
  await page.evaluate(()=>window.initialFileRow=document.querySelector('#sd-list .sd-row'));
  await page.keyboard.press('Control+a');assert.equal(await page.locator('#sd-list .sd-selected').count(),3);
  assert.ok(await page.evaluate(()=>initialFileRow===document.querySelector('#sd-list .sd-row')));
  await page.keyboard.press('End');assert.ok(await page.locator('#sd-list .sd-entry').last().evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Home');assert.ok(await page.locator('#sd-list .sd-entry').first().evaluate(el=>el===document.activeElement));
  await page.setViewportSize({width:390,height:844});
  const layout=await page.locator('#suite-disk-dialog').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,wide:[...el.querySelectorAll('*')].filter(node=>node.getBoundingClientRect().right>el.getBoundingClientRect().right-10).map(node=>({id:node.id,tag:node.tagName,width:node.getBoundingClientRect().width}))}));if(layout.scroll>layout.width+1)console.log(layout);assert.ok(layout.scroll<=layout.width+1);
  assert.ok(await page.locator('#sd-list').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.locator('#sd-search').fill('');await page.locator('#sd-list [data-path="parent"]').click();
  await page.locator('#sd-list [data-path="parent/child.txt"]').waitFor();
  await page.keyboard.press('Alt+ArrowUp');await page.locator('#sd-list [data-path="parent"]').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.SuiteInventoryUI);
  await page.evaluate(()=>{SuiteCapabilities.inventory=()=>Array.from({length:60},(_,i)=>({name:'Long inventory item '+i+' '+'.'.repeat(150)}));SuiteWorkspace.open('tools');});
  await page.locator('#sc-view').click();await page.locator('#sc-query').focus();await page.keyboard.press('ArrowDown');
  assert.ok(await page.locator('#sc-records input').first().evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Control+a');assert.match(await page.locator('#sc-count').textContent(),/60 selected/);
  await page.keyboard.press('End');assert.ok(await page.locator('#sc-records input').last().evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Space');assert.match(await page.locator('#sc-count').textContent(),/59 selected/);
  assert.ok(await page.locator('.sc-browser').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  console.log('PASS: scoped shortcuts, row navigation, selection highlighting, stable DOM, parent navigation and mobile file/inventory layouts.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
