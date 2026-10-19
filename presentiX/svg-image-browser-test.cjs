const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage({viewport:{width:1550,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8000/presentiX/');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="#ff0000"/><script>window.svgExecuted=true</script></svg>';
 await p.evaluate(async text=>{await SuiteDisk.write('Grinning Smiley.svg',new Blob([text],{type:'image/svg+xml'}),{app:'graphiX'});},svg);
 await p.locator('#addImage').click();await p.locator('#suite-load-virtual').click();await p.locator('#sd-list [data-path="Grinning Smiley.svg"]').click();await p.locator('#sd-import').click();
 await p.waitForFunction(()=>document.querySelector('#slide img')?.complete);
 assert.equal(await p.evaluate(()=>window.svgExecuted),undefined);
 const image=await p.evaluate(()=>deck.slides[0].elements.find(e=>e.type==='image'));assert.ok(image.src.startsWith('data:image/png;base64,'));assert.equal(image.w/image.h,2);
 assert.deepEqual(await p.locator('#slide img').evaluate(img=>{const c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').drawImage(img,0,0,1,1);return [...c.getContext('2d').getImageData(0,0,1,1).data];}),[255,0,0,255]);
 await p.locator('#undo').click();assert.equal(await p.locator('#slide img').count(),0);await p.locator('#redo').click();await p.reload();await p.locator('#slide img').waitFor();
 const media=await p.evaluate(async()=>{const blob=await PresentixPptx.write(deck),zip=await JSZip.loadAsync(blob);return Object.keys(zip.files).filter(x=>x.startsWith('ppt/media/')&&x.endsWith('.png'));});assert.equal(media.length,1);
 await p.locator('#image').setInputFiles({name:'local.svg',mimeType:'',buffer:Buffer.from(svg)});await p.waitForFunction(()=>document.querySelectorAll('#slide img').length===2);
 await p.locator('#image').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg>')});await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('invalid'));assert.equal(await p.locator('#slide img').count(),2);
 assert.deepEqual(errors,[]);console.log('PASS: virtual/local SVG insertion, decoded pixels, no script execution, Undo/Redo, persistence, PPTX media and malformed SVG rejection.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
