const {chromium}=require('playwright'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'import-size-'));
 const server=spawn('python3',['-u','server/server.py','--port','0','--skills-offline','--agent-no-commands','--agent-workspace',temp,'--config',path.join(temp,'providers.json'),'--search-config',path.join(temp,'search.json')],{cwd:path.resolve(__dirname,'..'),stdio:['ignore','pipe','pipe']});
 let browser,stderr='';server.stderr.on('data',data=>stderr+=data);
 try{
  const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error(stderr||'Server startup timeout')),15000);server.stdout.on('data',data=>{output+=data;const match=output.match(/listening on (\S+)/);if(match){clearTimeout(timer);resolve('http://'+match[1]);}});server.once('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/architex/');await page.waitForFunction(()=>window.ArchitexSemanticImport&&window.ArchitexIO);
  const result=await page.evaluate(async()=>{
   const size=20*1024*1024,original=ArchitexIO.getModel(),json=JSON.stringify(original),padded=json+' '.repeat(size-new TextEncoder().encode(json).length);
   const parsed=await ArchitexIO.parseImportFile(new File([padded],'workspace.json'),'both');
   let oversized='';try{await ArchitexIO.parseImportFile({size:size+1,name:'large.json',text:()=>{throw Error('Should reject before reading');}},'both');}catch(e){oversized=e.message;}
   const payload='a'.repeat(size),archive=new JSZip();archive.file('sources/large.md',payload);
   const zipped=new File([await archive.generateAsync({type:'uint8array',compression:'DEFLATE'})],'sources.zip');
   const sources=await ArchitexSemanticImport.readSources([new File([payload],'direct.md'),zipped],{media:SuiteMultimodal,zip:JSZip});
   const rstzip=new JSZip();rstzip.file('project/index.rst','Architecture\n============\n');rstzip.file('project/assets/large.txt',payload);
   const rst=await ArchitexRST.readZip(await rstzip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
   return {components:parsed.components.length,expected:original.components.length,oversized,issues:sources.issues,files:sources.items.map(f=>({bytes:f.bytes,length:f.content.length,hash:f.sha256})),rst:rst.find(f=>f.path==='assets/large.txt').content.length,unchanged:JSON.stringify(ArchitexIO.getModel())===JSON.stringify(original)};
  });
  assert.equal(result.components,result.expected);assert.match(result.oversized,/20 MiB/);assert.deepEqual(result.issues,[]);assert.equal(result.files.length,2);for(const file of result.files){assert.equal(file.bytes,20*1024*1024);assert.equal(file.length,file.bytes);assert.match(file.hash,/^[a-f0-9]{64}$/);}assert.equal(result.rst,20*1024*1024);assert.equal(result.unchanged,true);assert.deepEqual(errors,[]);
  console.log('PASS: 20 MiB native import, complete direct/ZIP AI sources, Sphinx ZIP assets, unchanged workspace and explicit oversized rejection.');
 }finally{await browser?.close();server.kill();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
