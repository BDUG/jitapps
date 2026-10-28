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

observed('run_command',{}, {jobId:'long-pass',exitCode:0,outputPaged:true,stdoutBytes:20000,stdoutNextOffset:5997,stderrBytes:0,stderrNextOffset:0});b=workingBrief(state);assert.equal(b.verificationPending,false);assert.equal(b.outputReviewPending,true);assert.deepEqual(b.suggestedInspections,[{tool:'read_command_output',args:{jobId:'long-pass',stream:'stdout',offset:5997,limit:12000}}]);
observed('read_command_output',{jobId:'long-pass',stream:'stdout',offset:5997},{nextOffset:17997,done:false});assert.equal(workingBrief(state).suggestedInspections[0].args.offset,17997);
observed('read_command_output',{jobId:'long-pass',stream:'stdout',offset:0},{nextOffset:20000,done:true});assert.equal(workingBrief(state).outputReviewPending,true);
observed('read_command_output',{jobId:'long-pass',stream:'stdout',offset:17997},{nextOffset:20000,done:true});assert.equal(workingBrief(state).outputReviewPending,false);
observed('run_command',{}, {jobId:'legacy-pass',exitCode:0,outputPaged:true,stdoutBytes:20000,stderrBytes:0});assert.equal(workingBrief(state).suggestedInspections[0].args.offset,0,'Old saved jobs without a preview cursor are reread safely');
