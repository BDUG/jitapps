const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(()=>document.querySelector('#editor').innerHTML='<p>Welcome <b>Welcome</b> <a href="https://example.com/Welcome">Welcome</a></p>');
  await page.locator('#suite-workspace-open').click();
  await page.locator('[data-panel=search]').click();
  assert.equal(await page.locator('#sw-results-page').textContent(),'Enter text to find');
  await page.locator('#sw-query').fill('Welcome');
  assert.match(await page.locator('#sw-results-page').textContent(),/Run Find/);
  await page.locator('#sw-find').click();
  assert.equal(await page.locator('#sw-results .sw-item').count(),3);
  await page.locator('#sw-replacement').fill('$& literal');
  await page.locator('#sw-replace').click();
  await page.locator('#sw-apply').click();
  await page.waitForFunction(()=>document.querySelector('#sw-status').textContent.startsWith('Updated'));
  assert.equal(await page.locator('#editor b').textContent(),'$& literal');
  assert.equal(await page.locator('#editor a').getAttribute('href'),'https://example.com/Welcome');
  await page.locator('#sw-query').fill('Definitely not present');
  await page.locator('#sw-find').click();
  assert.equal(await page.locator('#sw-results-page').textContent(),'No matching content');
  console.log('PASS: search states, markup text matching, reviewed literal replacement and protected attributes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
