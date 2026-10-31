const assert=require('node:assert/strict');
const L=require('../codingagentlib/javascript/loop.js');
const requests=['good','missing','cancelled'].map(id=>({id,tool:'read_file',args:{path:id+'.txt'}}));
const events=[{kind:'action',value:{id:'batch',tool:'parallel_read',args:{requests}}},{kind:'observation',value:{id:'batch',tool:'parallel_read',ok:false,error:'Partial failure',result:{format:'codingagentlib/parallel-read-v1',results:[{id:'good',tool:'read_file',callId:'g',started:true,ok:true},{id:'missing',tool:'read_file',callId:'m',started:true,ok:false,error:'Not found'},{id:'cancelled',tool:'read_file',callId:null,started:false,ok:false,cancelled:true}]}}}];
const original=JSON.stringify(events);let recovery=L.failureRecovery(events);
assert.equal(recovery.code,'partial_read_batch');assert.deepEqual(recovery.batch.unresolved,['missing','cancelled']);assert.equal(recovery.batch.items[0].status,'succeeded');assert.equal(JSON.stringify(events),original);
// A success for another path, or an unrelated receipt, cannot resolve the missing read.
events.push({kind:'action',value:{id:'wrong',tool:'read_file',args:{path:'other.txt'}}},{kind:'observation',value:{id:'wrong',tool:'read_file',ok:true}},{kind:'observation',value:{id:'unknown',tool:'read_file',ok:true}});
assert.deepEqual(L.failureRecovery(events).batch.unresolved,['missing','cancelled']);
events.push({kind:'action',value:{id:'fixed',tool:'read_file',args:{path:'missing.txt'}}},{kind:'observation',value:{id:'fixed',tool:'read_file',ok:true}});
recovery=L.assess(events).recovery;assert.deepEqual(recovery.batch.unresolved,['cancelled']);assert.equal(recovery.batch.items[1].status,'recovered');assert.equal(recovery.batch.items[1].recoveredBy,'fixed');
// Duplicate or invented batch members do not enter the ledger.
events[1].value.result.results.push({id:'good',tool:'read_file',ok:false},{id:'injected',tool:'run_command',ok:false});assert.equal(L.failureRecovery(events).batch.items.length,3);
events.push({kind:'user',value:{status:'follow_up',text:'New task'}});assert.equal(L.failureRecovery(events),null);
console.log('PASS targeted batch recovery: partial evidence retained, cancellation preserved, exact later receipts required, no mutation or execution, follow-up reset.');
(async()=>{
 global.SuiteCodingAgentSpec=require('./spec.js');const calls=[];
 const state={id:'recover',goal:'Inspect sources',tools:[{name:'parallel_read'},{name:'read_file'}],events:[]};
 const result=await L.run(state,{batch:0,record:async()=>{},finish:async()=>{},act:async action=>{calls.push(action);return action.tool==='parallel_read'?{ok:false,error:'Partial failure',result:events[1].value.result}:{ok:true,result:{text:'now present'}};},model:async request=>{
  if(request.step===2)assert.deepEqual(request.cycle.recovery.batch.unresolved,['missing','cancelled']);
  if(request.step===3){assert.equal(request.cycle.recovery.batch.items[1].status,'recovered');assert.deepEqual(request.cycle.recovery.batch.unresolved,['cancelled']);}
  return JSON.stringify({sessionId:request.sessionId,step:request.step,status:request.step<3?'act':'ask',plan:'Inspect unresolved source only',action:request.step===1?{tool:'parallel_read',args:{requests}}:request.step===2?{tool:'read_file',args:{path:'missing.txt'}}:null,question:'Resume the cancelled read?'});
 }});
 assert.equal(result.status,'waiting');assert.deepEqual(calls.map(a=>a.tool),['parallel_read','read_file']);assert.equal(calls[1].args.path,'missing.txt');console.log('PASS real planning loop receives partial-read ledger and targets only missing source, without replaying the successful read.');
})().catch(error=>{console.error(error);process.exitCode=1;});
