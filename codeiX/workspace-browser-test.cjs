const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1800,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.disk={'src/main.js':'const old = 1;\n','notes.txt':'Keep me','image.bin':'\0binary','node_modules/skip.js':'ignored'};
 window.writes=[];window.permission='granted';
 const missing=()=>new DOMException('Missing','NotFoundError');
 function dir(prefix='') {return {kind:'directory',name:prefix?prefix.split('/').filter(Boolean).at(-1):'Test workspace',async requestPermission(){return window.permission;},async *entries(){const names=new Set(Object.keys(disk).filter(p=>p.startsWith(prefix)).map(p=>p.slice(prefix.length).split('/')[0]));for(const name of names){const path=prefix+name;yield [name,Object.hasOwn(disk,path)?file(path):dir(path+'/')];}},async getDirectoryHandle(name,{create=false}={}){if(!create&&!Object.keys(disk).some(p=>p.startsWith(prefix+name+'/')))throw missing();return dir(prefix+name+'/');},async getFileHandle(name,{create=false}={}){const path=prefix+name;if(!Object.hasOwn(disk,path)){if(!create)throw missing();disk[path]='';}return file(path);},async removeEntry(name){writes.push('delete:'+prefix+name);delete disk[prefix+name];}};}
 function file(path){return {kind:'file',name:path.split('/').at(-1),async getFile(){return new File([disk[path]],this.name);},async createWritable(){let content;return {async write(text){content=text;},async close(){writes.push('write:'+path);disk[path]=content;},async abort(){}};}};}
 window.showDirectoryPicker=async()=>dir();
});
await page.goto('http://127.0.0.1:8000/codeiX/');page.on('dialog',d=>d.accept());
await page.locator('#openWorkspace').click();await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('Test workspace'));
assert.equal(await page.locator('#tree button').count(),2);await page.locator('[data-path="src/main.js"]').click();await page.locator('#editor').fill('const updated = 2;\n');assert.match(await page.locator('#saveStatus').textContent(),/unsaved/);
assert.equal(await page.evaluate(()=>disk['src/main.js']),'const old = 1;\n');await page.locator('#saveWorkspace').click();await page.waitForFunction(()=>disk['src/main.js']==='const updated = 2;\n');
assert.equal(await page.evaluate(()=>disk['image.bin']),'\0binary');assert.equal(await page.evaluate(()=>disk['node_modules/skip.js']),'ignored');
await page.locator('#editor').fill('const conflict = 3;');await page.evaluate(()=>disk['src/main.js']='external change');await page.locator('#saveWorkspace').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('External change detected'));
assert.equal(await page.evaluate(()=>disk['src/main.js']),'external change');await page.locator('#reloadWorkspace').click();await page.waitForFunction(()=>!document.querySelector('#reloadWorkspace').disabled);await page.locator('[data-path="src/main.js"]').click();assert.equal(await page.locator('#editor').inputValue(),'external change');
// A rename is a reviewed creation plus deletion, and unrelated files survive.
page.removeAllListeners('dialog');page.once('dialog',d=>d.accept('src/renamed.js'));await page.locator('#rename').click();page.on('dialog',d=>d.accept());await page.locator('#saveWorkspace').click();await page.waitForFunction(()=>Object.hasOwn(disk,'src/renamed.js')&&!Object.hasOwn(disk,'src/main.js'));
await page.locator('#delete').click();await page.locator('#saveWorkspace').click();await page.waitForFunction(()=>!Object.hasOwn(disk,'src/renamed.js'));assert.equal(await page.evaluate(()=>disk['notes.txt']),'Keep me');
await page.locator('[data-path="notes.txt"]').click();await page.locator('#editor').fill('permission check');await page.evaluate(()=>permission='denied');await page.locator('#saveWorkspace').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('permission was not granted'));assert.equal(await page.evaluate(()=>disk['notes.txt']),'Keep me');
await page.locator('#disconnectWorkspace').click();assert.equal(await page.locator('#saveWorkspace').isVisible(),false);assert.equal(await page.locator('#editor').inputValue(),'permission check');assert.deepEqual(errors,[]);
console.log('PASS: local folder import, nested files, explicit save, skipped-file preservation, external conflict protection, reload, rename/delete, denied permission and disconnect (browser directory API fixtures).');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
