const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage({viewport:{width:1550,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8000/sketchiX/');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="#ff0000"/><script>window.svgExecuted=true</script></svg>';
 await p.evaluate(async text=>{await SuiteDisk.write('Grinning Smiley.svg',new Blob([text],{type:'image/svg+xml'}),{app:'graphiX'});},svg);
 await p.locator('#addImage').click();await p.locator('#suite-load-virtual').click();await p.locator('#sd-list [data-path="Grinning Smiley.svg"]').click();await p.locator('#sd-import').click();
 await p.waitForFunction(()=>model.nodes.some(n=>n.shape==='image'));
 const image=await p.evaluate(()=>model.nodes.find(n=>n.shape==='image'));assert.ok(image.src.startsWith('data:image/png;base64,'));assert.equal(image.w/image.h,2);assert.equal(await p.evaluate(()=>window.svgExecuted),undefined);
 assert.deepEqual(await p.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').drawImage(img,0,0,1,1);return [...c.getContext('2d').getImageData(0,0,1,1).data];},image.src),[255,0,0,255]);
 assert.equal(await p.locator('#stage image').count(),1);await p.locator('#undo').click();assert.equal(await p.locator('#stage image').count(),0);await p.locator('#redo').click();await p.reload();await p.locator('#stage image').waitFor();
 const exported=await p.evaluate(async()=>{const svg=await SketchixIO.exportFile('svg',model),pptx=await SketchixIO.exportFile('pptx',model),zip=await JSZip.loadAsync(pptx);return {svg,media:Object.keys(zip.files).filter(p=>p.startsWith('ppt/media/')&&p.endsWith('.png'))};});assert.match(exported.svg,/<image /);assert.equal(exported.media.length,1);
 await p.locator('#image').setInputFiles({name:'local.svg',mimeType:'',buffer:Buffer.from(svg)});await p.waitForFunction(()=>model.nodes.filter(n=>n.shape==='image').length===2);
 await p.locator('#image').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg>')});await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('invalid'));assert.equal(await p.locator('#stage image').count(),2);
 assert.deepEqual(errors,[]);console.log('PASS: virtual/local SVG images, decoded pixels, no script execution, history, persistence, SVG/PPTX exports and invalid SVG rejection.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
