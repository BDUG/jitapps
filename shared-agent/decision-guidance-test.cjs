const {test}=require('node:test');
const assert=require('node:assert/strict');
global.SuiteCodingAgentSpec=require('./spec.js');
const L=require('./loop.js');
const action={tool:'run_command',args:{command:'npm',args:['test']}};
const denied=[{kind:'assistant',value:{sessionId:'s',step:1,status:'act',action}},{kind:'observation',value:{id:'s_1',tool:'run_command',ok:false,error:'Command is not allowed by the allowlist'}}];
test('unchanged denied actions pause immediately, alternatives and new follow-ups remain possible',async()=>{
 let calls=0,models=0;
 const result=await L.run({id:'s',tools:[{name:'run_command'}],events:[]},{
  model:async request=>{models++;assert.ok(request.decisionGuidance);return JSON.stringify({sessionId:request.sessionId,step:request.step,status:'act',plan:'Run test',action});},
  act:async()=>{calls++;return {ok:false,error:'Command is not allowed by the allowlist'};},record:async()=>{},finish:async()=>{throw Error('Cannot finish');}
 });
 assert.equal(calls,1);assert.equal(models,2);assert.equal(result.status,'waiting');assert.match(result.question,/already denied/);
 assert.equal(L.permissionRetry(denied,{...action,checks:[{path:'/exitCode',op:'equals',value:0}]}).blocked,true);
 assert.equal(L.permissionRetry([...denied.slice(0,1),{kind:'observation',value:{id:'s_1',tool:'run_command',ok:false,code:'permission_denied',error:'Rejected'}}],action).blocked,true);
 assert.equal(L.permissionRetry(denied,{tool:'read_file',args:{path:'package.json'}}).blocked,false);
 assert.equal(L.permissionRetry([...denied,{kind:'user',value:{status:'follow_up',text:'Permission configuration corrected'}}],action).blocked,false);
});
test('guidance prioritizes genuine context recovery and available output inspections',()=>{
 const missing={events:[{kind:'observation',value:{tool:'read_context',ok:false,code:'context_snapshot_missing',error:'Snapshot missing'}}],tools:[{name:'read_current_project'}]};
 assert.equal(L.decisionGuidance(missing).phase,'recover_context');assert.equal(L.decisionGuidance(missing).suggestedActions[0].tool,'read_current_project');
 const state={events:[{kind:'observation',value:{tool:'write_file',ok:true,result:{path:'game.js'}}},{kind:'observation',value:{tool:'run_command',ok:true,result:{exitCode:1,jobId:'actual-job'}}}],tools:[{name:'read_command_output'}]};
 const before=JSON.stringify(state),guidance=L.decisionGuidance(state);
 assert.equal(guidance.phase,'inspect_output');assert.equal(guidance.suggestedActions[0].args.jobId,'actual-job');assert.equal(JSON.stringify(state),before);
 assert.equal(L.decisionGuidance({...state,tools:[]}).suggestedActions.length,0);
});
test('verification guidance keeps task blockers explicit without inventing success',()=>{
 const state={events:[{kind:'observation',value:{tool:'apply_project',ok:true,result:{}}}],tools:[],tasks:[{id:'verify',title:'Verify game',status:'blocked'}]};
 const result=L.decisionGuidance(state);assert.equal(result.phase,'verify');assert.equal(result.blockedTasks[0].id,'verify');assert.deepEqual(result.readyTaskIds,[]);assert.equal(state.tasks[0].status,'blocked');
});
