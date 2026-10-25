const {PNG}=require('pngjs');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1700,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8000/mindiX/');await page.locator('#outline [data-topic="discover"]').click();
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=20;c.getContext('2d').fillRect(0,0,40,20);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#topicImage').setInputFiles({name:'topic.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.locator('#topics [data-topic="discover"] image').waitFor();
 assert.ok(await page.locator('#topicImagePreview').isVisible());
 // Check painted pixels, not just the presence of an SVG image element.
 const assertImagePainted=async()=>{
  await page.waitForFunction(()=>{const img=document.querySelector('#topicImagePreview');return img.complete&&img.naturalWidth>0;});
  const locator=page.locator('#topics [data-topic="discover"] image');
  await locator.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#topics [data-topic="discover"] image')?.getBoundingClientRect().width>0);
  const png=PNG.sync.read(await locator.screenshot()),black=[];
  for(let y=Math.floor(png.height*.4);y<Math.ceil(png.height*.6);y++)for(let x=Math.floor(png.width*.4);x<Math.ceil(png.width*.6);x++){
   const i=(y*png.width+x)*4;black.push(png.data[i]<20&&png.data[i+1]<20&&png.data[i+2]<20&&png.data[i+3]===255);
  }
  assert.ok(black.length&&black.every(Boolean),'Topic image pixels must be painted on the map');
 };
 await assertImagePainted();
 await page.locator('#branchLineColor').evaluate(el=>{el.value='#cc3344';el.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('#branchLineStyle').selectOption('dotted');await page.locator('#branchLineWidth').fill('5');await page.locator('#branchLineWidth').dispatchEvent('change');
 assert.equal(await page.locator('#branches path[stroke="#cc3344"]').getAttribute('stroke-dasharray'),'2 5');assert.equal(await page.locator('#branches path[stroke="#cc3344"]').getAttribute('stroke-width'),'5');
 await page.locator('#relationTarget').selectOption('shape');await page.locator('#relationLabel').fill('Supports');await page.locator('#relationColor').evaluate(el=>{el.value='#2277aa';});await page.locator('#relationStyle').selectOption('solid');await page.locator('#addRelation').click();
 const row=page.locator('.relationship-row').last();await row.locator('select').selectOption('dotted');await row.locator('input[type=number]').fill('4');await row.locator('input[type=number]').dispatchEvent('change');
 const saved=await page.evaluate(()=>SuiteAgentAdapter.snapshot());assert.ok(saved.nodes.find(n=>n.id==='discover').image.startsWith('data:image/png;base64,'));assert.equal(saved.relationships[0].style,'dotted');assert.equal(saved.relationships[0].width,4);
 await page.reload();const restored=await page.evaluate(()=>SuiteAgentAdapter.snapshot());assert.deepEqual(restored,saved);await page.locator('#outline [data-topic="discover"]').click();await assertImagePainted();
 const exports=await page.evaluate(async()=>{const model=SuiteAgentAdapter.snapshot(),diagram=Mindix.diagram(model),svg=await SketchixIO.exportFile('svg',diagram),drawio=await SketchixIO.exportFile('drawio',diagram),pptx=await SketchixIO.exportFile('pptx',Mindix.diagram(model,'all',null,'pptx')),zip=await JSZip.loadAsync(await pptx.arrayBuffer());return {svg,drawio,slide:await zip.file('ppt/slides/slide1.xml').async('string'),media:Object.keys(zip.files).filter(p=>p.startsWith('ppt/media/'))};});
 assert.match(exports.svg,/<image /);assert.match(exports.svg,/stroke-dasharray="2 5"/);assert.match(exports.svg,/#cc3344/);assert.match(exports.drawio,/shape=image/);assert.match(exports.drawio,/dashPattern=1 4/);assert.match(exports.slide,/prstDash val="dot"/);assert.ok(exports.media.length);
 await page.locator('#outline [data-topic="discover"]').click();await page.locator('#removeTopicImage').click();assert.equal(await page.locator('#topics [data-topic="discover"] image').count(),0);await page.locator('#undo').click();assert.equal(await page.locator('#topics [data-topic="discover"] image').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS: image upload/render/remove/Undo, branch/relationship styling, persistence, SVG/draw.io/PPTX images and dotted lines.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
