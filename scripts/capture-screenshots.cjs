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
   errors.length=0;await page.goto(base+url,{waitUntil:'networkidle'});
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
   await page.screenshot({path:path.join(output,id+'.png'),fullPage:true,animations:'disabled'});
   if(errors.length)throw Error(name+': '+errors.join('; '));
   console.log('Captured '+name);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
