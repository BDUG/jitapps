const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Worker}=require('../src/worker.cjs'),{Controller}=require('../src/controller.cjs');
test('each configured check is rerun for current inputs after command-side source changes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-each-check-'));await fs.writeFile(path.join(root,'source.txt'),'A');
 const worker=new Worker(path.resolve(__dirname,'../bin/codingagent-worker'+(process.platform==='win32'?'.exe':'')),root,[process.execPath]);t.after(async()=>{await worker.close();await fs.rm(root,{recursive:true,force:true});});
 const checks=[{name:'Lint',command:process.execPath,args:['-e',"require('fs').readFileSync('source.txt','utf8')"]},{name:'Tests',command:process.execPath,args:['-e',"const fs=require('fs');if(fs.readFileSync('source.txt','utf8')==='A')fs.writeFileSync('source.txt','B');process.stdout.write('tested')"]}];
 let turns=0;const events=[];
 const controller=new Controller(worker,async r=>{
  const turn=++turns;let action=null;
  if(turn===1)action={tool:'read_file',args:{path:'source.txt'}};
  if(turn===2||turn===6)action=r.verification.checks[0].action;
  if(turn===3||turn===4)action=r.verification.checks[1].action;
  if(turn===4){assert.equal(r.verificationFreshness.status,'stale');assert.equal(r.verification.checks[0].status,'stale');assert.equal(r.verification.checks[1].status,'stale');}
  if(turn===5){assert.equal(r.verificationFreshness.status,'current');assert.equal(r.verification.checks[0].status,'stale');assert.equal(r.verification.checks[1].status,'passed');r.verification.passed=true;r.verification.checks[0].status='passed';r.verificationFreshness.currentInputDigest='forged';}
  if(turn===6){assert.equal(r.verification.checks[0].status,'stale');assert.equal(r.verification.checks[1].status,'passed');}
  return {sessionId:r.sessionId,step:r.step,status:action?'act':'done',plan:'Verify current inputs for every configured check',action,summary:'Configured checks passed for current tracked source'};
 },e=>events.push(e));
 const first=await controller.run('Verify all current source',{commands:true},10,false,[],checks);assert.equal(first.reason,'verification_required');assert.equal(turns,5);assert.equal(await fs.readFile(path.join(root,'source.txt'),'utf8'),'B');assert.ok(events.some(e=>e.kind==='verificationRequired'&&e.report.checks[0].status==='stale'));
 const final=await controller.run('',{},5,true,[],checks);assert.equal(final.status,'complete');assert.equal(turns,7);
 const saved=await worker.dispatch({op:'session',session:controller.session}),commands=saved.events.filter(e=>e.kind==='observation'&&e.value.tool==='run_command');assert.equal(commands.length,4);assert.equal(new Set(commands.slice(2).map(e=>e.value.result.verificationBinding.inputDigest)).size,1);
});
