const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{Worker}=require('../src/worker.cjs'),{Controller}=require('../src/controller.cjs'),History=require('../src/history-context.cjs'),{modelContent}=require('../src/attachments.cjs');
test('native saved media references survive agent steps, compaction and resume without reattachment',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-media-session-')),worker=new Worker(path.resolve(__dirname,'../bin/codingagent-worker'+(process.platform==='win32'?'.exe':'')),root);
 t.after(async()=>{await worker.close();await fs.rm(root,{recursive:true,force:true});});await fs.writeFile(path.join(root,'source.txt'),'source');let turns=0;
 const media={name:'reference.png',path:'reference.png',kind:'image',mimeType:'image/png',dataUrl:'data:image/png;base64,YQ=='};
 const controller=new Controller(worker,async r=>{turns++;const compact=History.prepare(r,{budget:8000}).request,parts=modelContent(compact);assert.equal(parts[2].image_url.url,media.dataUrl);assert.ok(!parts[0].text.includes('base64,'));return {sessionId:r.sessionId,step:r.step,status:turns===1?'act':'ask',plan:'Inspect reference and source',...(turns===1?{action:{tool:'read_file',args:{path:'source.txt'}}}:{action:null,question:'Which area should change?'})};});
 assert.equal((await controller.run('Inspect visual reference',{},4,false,[media])).status,'waiting');
 await worker.dispatch({op:'event',session:controller.session,value:{status:'note',text:'historical context '.repeat(2000)}});
 assert.equal((await controller.run('Focus on the header',{},2,true,[])).status,'waiting');assert.equal(turns,3);
 const saved=await worker.dispatch({op:'session',session:controller.session});assert.equal(saved.events.filter(e=>e.value?.status==='reference_files').length,1);
});
