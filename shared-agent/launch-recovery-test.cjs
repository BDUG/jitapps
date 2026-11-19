const assert=require('node:assert/strict');global.SuiteCodingAgentSpec=require('./spec.js');
const L=require('./loop.js');
const action={tool:'run_command',args:{command:'broken-tool'}},events=[{kind:'action',value:{id:'launch',...action}},{kind:'observation',value:{id:'launch',tool:'run_command',ok:false,code:'command_launch_failed',error:'Executable not found',result:{jobId:'retained',exitCode:null,started:false,launchError:{code:'missing_executable_or_interpreter',errno:2,message:'Executable not found'}}}}];
const before=JSON.stringify(events),report=L.failureRecovery(events);
assert.equal(report.code,'command_launch_failed');assert.equal(report.jobId,'retained');assert.equal(report.started,false);assert.equal(report.exitCode,null);assert.equal(report.launchError.errno,2);
assert.match(report.guidance.join(' '),/process did not start/);assert.match(report.guidance.join(' '),/shebang/);assert.match(report.guidance.join(' '),/do not retry unchanged/);
assert.equal(L.evidence(events).passed,0);assert.equal(JSON.stringify(events),before);
console.log('PASS: launch failures provide retained job diagnostics and explicit recovery without inventing a successful exit or mutating history.');
