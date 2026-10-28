const assert=require('node:assert/strict');
global.SuiteCodingAgentSpec=require('../codingagentlib/javascript/spec.js');
const Cycle=require('./cycle.js');
(async()=>{
 const successful={kind:'observation',value:{id:'one',tool:'run_command',ok:true,result:{exitCode:0}}};
 assert.equal(Cycle.evidence([successful]).verified,true);
 assert.equal(Cycle.evidence([successful,{kind:'user',value:{text:'check again'}}]).verified,false);
 assert.equal(Cycle.evidence([{...successful,value:{...successful.value,result:{exitCode:1}}}]).verified,false);
 const phases=[],state={id:'shell',goal:'Check shell',step:0,events:[],tools:[{name:'run_command'}],permissions:{allowCommands:true,allowEdits:false}};
 let actions=0,finished=0;
 const result=await Cycle.run(state,{onPhase:p=>phases.push(p.phase),record:async()=>{},act:async action=>{assert.equal(action.args.command,'sh');actions++;return {ok:true,result:{exitCode:0,stdout:'observed'}};},finish:async()=>finished++,model:async request=>{
  assert.equal(request.shellCycle.protocol,'shellix/inspect-plan-execute-observe-verify/v1');
  assert.equal(request.shellCycle.evidence.verified,request.step>1);
  return JSON.stringify({sessionId:request.sessionId,step:request.step,status:request.step===1?'act':'done',plan:'Check the observed shell output',action:request.step===1?{tool:'run_command',args:{command:'sh',args:['-c','printf observed']}}:null,outcome:'complete',summary:'Observed expected output',verification:['Command exit 0 and expected output']});
 }});
 assert.equal(result.status,'complete');assert.equal(actions,1);assert.equal(finished,1);for(const phase of ['Inspect','Plan','Execute','Observe','Verify'])assert.ok(phases.includes(phase));
 const unverified=await Cycle.run({...state,step:0,events:[]},{record:async()=>{},finish:async()=>assert.fail('Must not complete without fresh evidence'),model:async r=>JSON.stringify({sessionId:r.sessionId,step:r.step,status:'done',plan:'Unsupported success',action:null,outcome:'complete',summary:'Done',verification:[]})});assert.equal(unverified.status,'waiting');assert.match(unverified.question,/Independent review rejected completion/);
 console.log('PASS shell cycle: actual actions, visible phases, instruction-scoped evidence and unverified completion rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
