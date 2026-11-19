const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Worker}=require('../src/worker.cjs'),{Controller}=require('../src/controller.cjs');
test('native retry guard retains failure evidence beyond the host review window and offers existing recovery controls',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-retry-guard-'));
 for(let i=4;i<=30;i++)await fs.writeFile(path.join(root,'source'+i+'.txt'),'source '+i);
 const worker=new Worker(path.resolve(__dirname,'../bin/codingagent-worker'+(process.platform==='win32'?'.exe':'')),root,[process.execPath]);t.after(async()=>{await worker.close();await fs.rm(root,{recursive:true,force:true});});
 const updates=[];let turns=0;
 const invocation={tool:'run_command',args:{command:process.execPath,args:['-e',"require('fs').appendFileSync('attempts.txt','x');process.exit(1)"]}};
 const controller=new Controller(worker,async request=>{turns++;if(turns===31){assert.equal(request.loopReview.recentFailures.length,0);request.terminalRetryPolicy.maxUnchangedFailures=999;}return {sessionId:request.sessionId,step:request.step,status:'act',plan:'Inspect evidence before retrying',action:turns<=3||turns===31?invocation:{tool:'read_file',args:{path:'source'+turns+'.txt'}}};},event=>updates.push(event));
 const result=await controller.run('Diagnose repeated failures',{commands:true},40);
 assert.equal(result.reason,'repeated_terminal_failure');assert.equal(turns,31);assert.equal(result.recovery.automaticRetry,false);assert.equal(await fs.readFile(path.join(root,'attempts.txt'),'utf8'),'xxx');
 assert.ok(updates.some(e=>e.kind==='loopGuard'&&e.code==='repeated_terminal_failure'&&e.blocked));
 const saved=await worker.dispatch({op:'session',session:controller.session});assert.equal(saved.status,'paused');assert.equal(saved.events.filter(e=>e.kind==='observation'&&e.value.tool==='run_command').length,3);
});
