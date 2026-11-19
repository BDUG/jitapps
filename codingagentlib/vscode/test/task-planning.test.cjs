const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Worker}=require('../src/worker.cjs'),{Controller}=require('../src/controller.cjs');
test('native controller repairs an invalid task graph before execution and advances a bound dependency plan',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vscode-task-plan-'));await fs.writeFile(path.join(root,'source.txt'),'current source');
 const worker=new Worker(path.resolve(__dirname,'../bin/codingagent-worker'+(process.platform==='win32'?'.exe':'')),root);t.after(async()=>{await worker.close();await fs.rm(root,{recursive:true,force:true});});let turns=0;
 const tasks=[{id:'inspect',title:'Inspect source',status:'in_progress'},{id:'implement',title:'Implement change',status:'pending',dependsOn:['inspect']}];
 const controller=new Controller(worker,async request=>{
  const turn=++turns,base={sessionId:request.sessionId,step:request.step,status:'act',plan:'Inspect prerequisites and implement',tasks:structuredClone(tasks)};
  if(turn===1){base.tasks[0].dependsOn=['unknown'];base.action={tool:'write_file',args:{path:'unexpected.txt',content:'lost',expectedHash:'missing'}};return base;}
  if(turn===2){assert.ok(request.events.some(e=>e.kind==='protocol_error'&&/prerequisite/i.test(e.value.error)));await assert.rejects(fs.access(path.join(root,'unexpected.txt')));return {...base,action:{tool:'read_file',taskId:'inspect',args:{path:'source.txt'}}};}
  assert.deepEqual(request.tasks,turn===3?tasks:[{...tasks[0],status:'done'},{...tasks[1],status:'in_progress'}]);
  base.tasks[0].status='done';base.tasks[1].status=turn===3?'in_progress':'done';
  return turn===3?{...base,action:{tool:'write_file',taskId:'implement',args:{path:'implemented.txt',content:'implemented after inspection',expectedHash:'missing'}}}:{...base,status:'done',action:null,outcome:'partial',summary:'Implemented; no command-based verification was permitted.'};
 });
 const result=await controller.run('Implement a change',{edits:true},6);assert.equal(result.status,'complete');assert.equal(result.outcome,'partial');assert.equal(turns,4);assert.equal(await fs.readFile(path.join(root,'implemented.txt'),'utf8'),'implemented after inspection');await assert.rejects(fs.access(path.join(root,'unexpected.txt')));
 const saved=await worker.dispatch({op:'session',session:controller.session});assert.equal(saved.events.filter(e=>e.kind==='observation').length,2);
});
