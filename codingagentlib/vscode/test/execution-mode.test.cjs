const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const Mode=require('../src/execution-mode.cjs'),{Controller}=require('../src/controller.cjs'),{Worker}=require('../src/worker.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-plan-mode-'));await fs.writeFile(path.join(root,'source.txt'),'current source');const worker=new Worker(path.resolve(__dirname,'../bin/codingagent-worker'+(process.platform==='win32'?'.exe':'')),root,[process.execPath]);const workers=[worker];t.after(async()=>{for(const item of workers)await item.close();await fs.rm(root,{recursive:true,force:true});});return {root,worker,workers};}
function reply(r,action){return {sessionId:r.sessionId,step:r.step,status:action?'act':'done',plan:'Inspect and plan',action,summary:'Change source.txt in a separate Build, then run its tests.'};}
test('plan mode inspects actual source, completes without executing configured checks and saves its restrictions',async t=>{
 const {root,worker}=await fixture(t);let turns=0;
 const controller=new Controller(worker,async r=>{assert.equal(r.executionMode.mode,'plan');assert.equal(r.permissions.allowEdits,false);assert.equal(r.permissions.allowCommands,false);assert.ok(!r.tools.some(t=>['write_file','run_command','workflow_run','skill_save'].includes(t.name)));return reply(r,++turns===1?{tool:'read_file',args:{path:'source.txt'}}:null);});
 const result=await controller.run('Plan a change',{edits:true,commands:true},4,false,[],[{name:'tests',command:process.execPath,args:['-e',"require('fs').writeFileSync('unexpected','x')"]}],'run',0,'plan');
 assert.equal(result.status,'complete');assert.equal(result.executionMode,'plan');const saved=await worker.dispatch({op:'session',session:controller.session});assert.equal(saved.allowEdits,false);assert.equal(saved.allowCommands,false);assert.equal(Mode.saved(saved),'plan');assert.equal(saved.events.filter(e=>e.kind==='observation').length,1);assert.equal(await fs.readFile(path.join(root,'source.txt'),'utf8'),'current source');await assert.rejects(fs.access(path.join(root,'unexpected')));
});
test('model context mutation and a Build-mode resume cannot upgrade a saved Plan',async t=>{
 const {root,worker}=await fixture(t);let tool='write_file';const controller=new Controller(worker,async r=>{assert.equal(r.executionMode.mode,'plan');r.executionMode.mode='build';r.permissions.allowEdits=true;r.permissions.allowCommands=true;r.tools.push({name:tool});return reply(r,{tool,args:{path:'source.txt',content:'lost',expectedHash:'missing',command:process.execPath,args:['-e',"require('fs').writeFileSync('unexpected','x')"]}});});
 let result=await controller.run('Plan',{edits:true,commands:true},3,false,[],[],'run',0,'plan');assert.equal(result.reason,'plan_action_blocked');
 for(tool of ['run_command','workflow_run','skill_save','memory_store','workflow_save']){result=await controller.run('Continue',{edits:true,commands:true},3,true,[],[],'run',0,'build');assert.equal(result.reason,'plan_action_blocked');}
 const saved=await worker.dispatch({op:'session',session:controller.session});assert.equal(saved.events.filter(e=>e.kind==='observation').length,0);assert.equal(Mode.saved(saved),'plan');assert.equal(await fs.readFile(path.join(root,'source.txt'),'utf8'),'current source');await assert.rejects(fs.access(path.join(root,'unexpected')));
});
test('Plan restriction is checked again after asynchronous host review',async t=>{
 const {worker}=await fixture(t);const controller=new Controller(worker,async r=>reply(r,{tool:'read_file',args:{path:'source.txt'}}),()=>{},async response=>{response.action={tool:'write_file',args:{path:'source.txt',content:'lost',expectedHash:'missing'}};});
 assert.equal((await controller.run('Plan',{},3,false,[],[],'run',0,'plan')).reason,'plan_action_blocked');
 const saved=await worker.dispatch({op:'session',session:controller.session});assert.equal(saved.events.filter(e=>e.kind==='observation').length,0);
});
test('unknown modes fail closed and legacy sessions retain Build behavior',()=>{assert.throws(()=>Mode.normalize('automatic'));assert.equal(Mode.saved({events:[]}),'build');assert.equal(Mode.blocked({sessionId:'s',step:1,status:'act',action:{tool:'write_file'}},{sessionId:'s',step:2},'plan'),null);});

test('persisted Plan mode survives native worker replacement and fresh Controller resume',async t=>{
 const {root,worker,workers}=await fixture(t);const first=new Controller(worker,async r=>reply(r,{tool:'read_file',args:{path:'source.txt'}}));
 assert.equal((await first.run('Plan',{},1,false,[],[],'run',0,'plan')).status,'paused');const id=first.session;await worker.close();
 const replacement=new Worker(path.resolve(__dirname,'../bin/codingagent-worker'+(process.platform==='win32'?'.exe':'')),root,[process.execPath]);workers.push(replacement);
 const resumed=new Controller(replacement,async r=>{assert.equal(r.executionMode.mode,'plan');assert.equal(r.permissions.allowCommands,false);return {sessionId:r.sessionId,step:r.step,status:'ask',plan:'Clarify the plan',action:null,question:'Which acceptance checks should the later Build use?'};});resumed.session=id;
 assert.equal((await resumed.run('Continue',{edits:true,commands:true},2,true,[],[],'run',0,'build')).status,'waiting');assert.equal(resumed.executionMode,'plan');
 const saved=await replacement.dispatch({op:'session',session:id});assert.equal(Mode.saved(saved),'plan');assert.equal(saved.events.filter(e=>e.kind==='observation').length,1);
});
