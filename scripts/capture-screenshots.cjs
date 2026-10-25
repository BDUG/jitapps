/* Run the suite server first, then: node scripts/capture-screenshots.cjs
 * Requires Playwright and Chromium; BASE_URL / CHROMIUM_PATH are optional.
 * Uses a fresh profile and built-in examples, without making AI requests.
 */
const {chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const base=process.env.BASE_URL||'http://127.0.0.1:8000',output=path.resolve(__dirname,'../assets/screenshots');
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,colorScheme:'light',locale:'en-US',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/',{waitUntil:'networkidle'});
  const apps=await page.evaluate(()=>SuiteApps.map(({id,name})=>({id,name})));
  for(const {id,name,url}of [{id:'desktop',name:'Desktop',url:'/'},...apps.map(app=>({...app,url:'/'+app.id+'/'}))]){
   if(process.env.ONLY&&!process.env.ONLY.split(',').includes(id))continue;
   errors.length=0;await page.goto(base+url,{waitUntil:'networkidle'});
   if(id==='photiX'){
    await page.waitForFunction(()=>window.SuiteAgentAdapter?.ready);
    await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=960;c.height=640;const x=c.getContext('2d'),sky=x.createLinearGradient(0,0,0,640);sky.addColorStop(0,'#73b5dc');sky.addColorStop(1,'#f5dfba');x.fillStyle=sky;x.fillRect(0,0,960,640);x.fillStyle='#f7b267';x.beginPath();x.arc(720,145,65,0,Math.PI*2);x.fill();for(const [color,points]of [['#607c88',[[0,400],[190,180],[410,440],[650,230],[960,400],[960,640],[0,640]]],['#385b62',[[0,490],[250,330],[500,500],[760,350],[960,470],[960,640],[0,640]]]]){x.fillStyle=color;x.beginPath();points.forEach(([px,py],i)=>i?x.lineTo(px,py):x.moveTo(px,py));x.closePath();x.fill();}x.fillStyle='#8ab4bb';x.fillRect(0,505,960,135);x.fillStyle='#ffffffbb';for(let i=0;i<9;i++)x.fillRect(490+i*14,525+i*10,260-i*22,2);await SuiteAgentAdapter.restore({version:1,name:'Lake study · illustrative sample',width:960,height:640,image:c.toDataURL(),operations:[]});document.querySelectorAll('#photo-ai details').forEach(d=>d.open=false);const zoom=document.querySelector('#zoom');zoom.value='75';zoom.dispatchEvent(new Event('input'));});
    const bounds=await page.locator('#image').boundingBox();await page.mouse.move(bounds.x+bounds.width*.66,bounds.y+bounds.height*.1);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.84,bounds.y+bounds.height*.36);await page.mouse.up();
   }
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
   await page.screenshot({path:path.join(output,id+'.png'),fullPage:true,animations:'disabled'});
   if(errors.length)throw Error(name+': '+errors.join('; '));
   console.log('Captured '+name);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
