const assert=require('node:assert/strict'),{chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:8031';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const [app,kind,format,selector]of [['textiX','document','gdoc','#exportFormat'],['sheetiX','spreadsheet','gsheet','#format'],['presentiX','presentation',null,null]]){
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let office,exported=false;
 await page.addInitScript(()=>localStorage.setItem('suite-google-drive-config-v1',JSON.stringify({clientId:'test.apps.googleusercontent.com',access:'all'})));
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:'test',expires_in:3600})})}}};`}));
 const name='Round trip '+kind,mime='application/vnd.google-apps.'+kind;
 await page.route('https://www.googleapis.com/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname.includes('/upload/')){
  const body=req.postDataBuffer(),boundary=req.headers()['content-type'].match(/boundary=([^;]+)/)[1];
  assert.ok(body.includes(Buffer.from('"mimeType":"'+mime+'"')));assert.ok(body.includes(Buffer.from('"name":"'+name+'"')));
  const begin=body.indexOf(Buffer.from('PK')),end=body.lastIndexOf(Buffer.from('\r\n--'+boundary+'--'));assert.ok(begin>=0&&end>begin);office=body.subarray(begin,end);
  return route.fulfill({json:{id:'native',name,mimeType:mime,version:'1'}});
 }if(url.pathname.endsWith('/export')){assert.ok(office);assert.ok(url.searchParams.get('mimeType').includes('openxmlformats'));exported=true;return route.fulfill({body:office,contentType:url.searchParams.get('mimeType')});}
 return route.fulfill({json:{files:office?[{id:'native',name,mimeType:mime,version:'1'}]:[]}});});
 await page.goto(base+'/'+app+'/');await page.locator('#name').fill(name);await page.locator('#name').dispatchEvent('change');
 if(format){await page.locator(selector).selectOption(format);await page.locator('#export').click();}else await page.locator('#exportGoogle').click();
 await page.locator('#gd-connect').click();await page.waitForFunction(()=>document.querySelector('#gd-auth').textContent.startsWith('Connected'));
 assert.equal(await page.locator('#gd-file-type').inputValue(),kind);await page.locator('#gd-save-form button').click();await page.waitForFunction(()=>document.querySelector('#gd-status').textContent.startsWith('Saved '));assert.ok(office?.length>0);await page.locator('#gd-close').click();
 await page.locator('#importGoogle').click();await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();await page.locator('#gd-load').click();await page.waitForFunction(()=>!document.querySelector('#suite-google-drive').open);await page.waitForFunction(n=>document.querySelector('#name').value===n,name);assert.ok(exported);assert.deepEqual(errors,[]);await page.close();
 console.log('PASS '+app+': native '+kind+' create and OOXML import round trip (mock Google conversion).');
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
