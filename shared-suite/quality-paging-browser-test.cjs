const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8013')+'/textiX/');
  await page.evaluate(()=>{
   SuiteQuality.report=()=>({createdAt:new Date().toISOString(),counts:{error:75,warning:50,info:0},findings:Array.from({length:125},(_,i)=>({severity:i<75?'error':'warning',code:'F'+i,path:'field.'+i,message:'Finding '+i}))});
  });
  await page.locator('#suite-workspace-open').click();
  await page.locator('[data-panel=inspector]').click();
  await page.locator('#sw-quality-run').click();
  await page.waitForFunction(()=>document.querySelector('#sw-quality-range').textContent==='1–50 of 125 findings');
  assert.equal(await page.locator('#sw-quality-findings .sw-item').count(),50);
  await page.locator('#sw-quality-next').click();
  assert.equal(await page.locator('#sw-quality-range').textContent(),'51–100 of 125 findings');
  await page.locator('#sw-quality-next').click();
  assert.equal(await page.locator('#sw-quality-findings .sw-item').count(),25);
  assert.ok(await page.locator('#sw-quality-next').isDisabled());
  await page.locator('#sw-quality-filter').selectOption('error');
  assert.equal(await page.locator('#sw-quality-range').textContent(),'1–50 of 75 findings');
  await page.locator('#sw-quality-next').click();
  assert.equal(await page.locator('#sw-quality-findings .sw-item').count(),25);
  await page.locator('#sw-quality-filter').selectOption('info');
  assert.match(await page.locator('#sw-quality-findings').textContent(),/No findings for this filter/);
  assert.ok(await page.locator('#sw-quality-pages').isHidden());
  const download=page.waitForEvent('download');
  await page.locator('#sw-quality-export').click();
  const report=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));
  assert.equal(report.findings.length,125);
  assert.equal(report.findings.at(-1).code,'F124');
  console.log('PASS: bounded preflight rendering, full paging, severity reset, empty filters and complete report export.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
