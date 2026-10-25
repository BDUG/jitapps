const assert=require('node:assert/strict');const {workingBrief}=require('./loop.js');
const events=[],state={id:'s',tools:[{name:'read_command_output'}],events};let step=0;
function observed(tool,args,result,extra={}){const n=++step;events.push({kind:'assistant',value:{step:n,status:'act',action:{tool,args}}},{kind:'observation',value:{id:'s_'+n,tool,ok:true,result,...extra}});}
observed('write_file',{path:'main.js'},{hash:'x'});observed('run_command',{}, {jobId:'failed',exitCode:1});let b=workingBrief(state);assert.equal(b.changedFiles[0].path,'main.js');assert.equal(b.verificationPending,true);assert.equal(b.suggestedInspections.length,2);assert.equal(b.latestCommand.passed,false);
observed('read_command_output',{jobId:'failed',stream:'stderr'},{nextOffset:100,done:false});b=workingBrief(state);assert.equal(b.suggestedInspections.find(x=>x.args.stream==='stderr').args.offset,100);
observed('read_command_output',{jobId:'wrong',stream:'stderr',offset:100},{nextOffset:200,done:true});assert.equal(workingBrief(state).suggestedInspections.length,2);
observed('read_command_output',{jobId:'failed',stream:'stderr',offset:100},{nextOffset:120,done:true});assert.equal(workingBrief(state).suggestedInspections.length,1);
observed('run_script',{}, {jobId:'pass',exitCode:0});b=workingBrief(state);assert.equal(b.verificationPending,false);assert.equal(b.suggestedInspections.length,0);assert.equal(b.latestCommand.afterLatestEdit,true);
observed('replace_text',{path:'main.js'},{hash:'y'});assert.equal(workingBrief(state).verificationPending,true);assert.equal(workingBrief(state).changedFileCount,1);
events.push({kind:'user',index:100,value:{status:'follow_up',text:'New goal with sensitive text'}});assert.equal(workingBrief(state).latestInstruction.eventIndex,100);assert.ok(!JSON.stringify(workingBrief(state)).includes('sensitive text'));
observed('run_command',{}, {jobId:'checks',exitCode:0},{checks:{passed:false}});assert.equal(workingBrief(state).latestCommand.passed,false);assert.equal(workingBrief({...state,tools:[]}).suggestedInspections.length,0);
const before=JSON.stringify(events);workingBrief(state);assert.equal(JSON.stringify(events),before);console.log('PASS: evidence ledger, stale verification, failure diagnosis, exact output cursors, tool availability, latest instructions and immutable history.');
