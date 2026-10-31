const {test}=require('node:test');
const assert=require('node:assert/strict');
const L=require('./loop.js');
const tasks=[{id:'build',title:'Create the game',status:'done'},{id:'verify',title:'Validate proposal',status:'blocked'}];
const events=[{kind:'observation',value:{tool:'apply_project',ok:true,result:{}}},{kind:'assistant',value:{status:'done',outcome:'partial',summary:'Game proposed; verification unavailable',tasks}}];
test('partial outcomes retain blockers and do not become successful completion',()=>{
 const state=L.completionState(events);assert.equal(state.needsFollowUp,true);assert.equal(state.outcome,'partial');assert.equal(state.remaining[0].id,'verify');
 assert.equal(L.completionState([...events,{kind:'user',value:{status:'follow_up',text:'Verify it'}}]),null);
 assert.equal(L.completionState([...events,{kind:'assistant',value:{status:'act',tasks}}]),null);
});
test('zero-command evidence does not claim there was a latest command or a command failure',()=>{
 const value=L.evidenceSummary(events);assert.match(value.text,/not been verified by a command/);assert.ok(!value.text.includes('after the latest command'));assert.equal(value.attention,false);
 const failed=L.evidenceSummary([{kind:'observation',value:{tool:'run_command',ok:true,result:{exitCode:1}}}]);assert.equal(failed.attention,true);
});
test('unfinished checklists remain explicit even with an inconsistent complete report',()=>{
 const value=L.completionState([{kind:'assistant',value:{status:'done',outcome:'complete',tasks}}]);assert.equal(value.outcome,'partial');
 const complete=L.completionState([{kind:'assistant',value:{status:'done',outcome:'complete',tasks:tasks.map(task=>({...task,status:'done'}))}}]);assert.equal(complete.needsFollowUp,false);
});
test('a partial run resumes with fresh verification and can then complete',async()=>{
 global.SuiteCodingAgentSpec=require('./spec.js');
 const state={id:'resume-partial',events:[...events,{kind:'user',value:{status:'follow_up',text:'Verify the remaining work'}}],tools:[{name:'run_command'}],permissions:{allowCommands:true}};
 let calls=0,finished;
 const result=await L.run(state,{
  model:async request=>JSON.stringify({sessionId:request.sessionId,step:request.step,status:calls++?'done':'act',plan:'Verify the saved game',action:calls===1?{tool:'run_command',args:{command:'node',args:['--check','game.js']}}:null,tasks:tasks.map(task=>({...task,status:task.id==='verify'&&calls===1?'in_progress':'done'})),outcome:'complete',summary:'Verification observed',verification:['Observed syntax check exit 0']}),
  act:async()=>({ok:true,result:{exitCode:0}}),record:async()=>{},finish:async value=>{finished=value;}
 });
 assert.equal(result.outcome,'complete');assert.equal(result.evidence.commands,1);assert.equal(finished.tasks.every(task=>task.status==='done'),true);
});
