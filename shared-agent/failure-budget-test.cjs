const assert=require('node:assert/strict');global.SuiteCodingAgentSpec=require('./spec.js');const L=require('./loop.js');
const action={tool:'run_command',args:{command:'npm test'}};
const events=[];
function add(id,a=action,observation={ok:true,result:{exitCode:1,stderr:'different failure '+id}}){events.push({kind:'action',value:{id,...a}},{kind:'observation',value:{id,tool:a.tool,...observation}});}
for(let i=0;i<3;i++)add('c'+i);
assert.equal(L.failureBudget(events,action).blocked,true);assert.equal(L.stalled(events,action),false);
assert.equal(L.failureBudget(events,{...action,args:{command:'npm run lint'}}).blocked,false);
// Duplicate observations cannot spend another retry; unrelated/delayed receipts cannot clear it.
events.push({...events.at(-1)},{kind:'observation',value:{id:'unknown',tool:'run_command',ok:true,result:{exitCode:0}}});assert.equal(L.failureBudget(events,action).failures,3);
const before=JSON.stringify(events);L.failureBudget(events,action);assert.equal(JSON.stringify(events),before);
add('pass',action,{ok:true,result:{exitCode:0}});assert.equal(L.failureBudget(events,action).failures,0);
for(let i=0;i<3;i++)add('again'+i);
add('edit',{tool:'write_file',args:{path:'main.js'}},{ok:true,result:{hash:'new'}});assert.equal(L.failureBudget(events,action).blocked,false);
for(let i=0;i<3;i++)add('final'+i);
assert.equal(L.failureBudget([...events,{kind:'user_action',value:{operation:'script_write'}}],action).blocked,false);
assert.equal(L.failureBudget([...events,{kind:'user',value:{status:'follow_up',text:'Changed environment; retry'}}],action).blocked,false);
// A command that exits zero but fails declared checks still consumes the budget.
const checked=[];for(let i=0;i<3;i++)checked.push({kind:'action',value:{id:'x'+i,...action}},{kind:'observation',value:{id:'x'+i,tool:action.tool,ok:true,result:{exitCode:0},checks:{passed:false}}});assert.equal(L.failureBudget(checked,action).blocked,true);
(async()=>{let calls=0,turns=0;const updates=[];const result=await L.run({id:'budget',goal:'Verify project',tools:[{name:'run_command'}],events:[]},{batch:0,record:async()=>{},finish:async()=>{},onUpdate:e=>updates.push(e),model:async request=>{turns++;return JSON.stringify({sessionId:request.sessionId,step:request.step,status:'act',plan:'Retry verification',action});},act:async()=>({ok:true,result:{exitCode:1,stderr:'Failure variant '+(++calls)}})});
assert.equal(calls,3);assert.equal(turns,4);assert.equal(result.status,'waiting');assert.match(result.question,/failed three times/);assert.ok(updates.some(e=>e.value?.format==='suite-agent-failure-budget/v1'));console.log('PASS failure circuit breaker: varying failures pause before fourth execution; success, edit and follow-up resets; duplicate receipts ignored; checked failures counted.');})().catch(e=>{console.error(e);process.exitCode=1;});
