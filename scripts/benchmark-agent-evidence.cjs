const assert=require('node:assert/strict'),path=require('node:path'),{performance}=require('node:perf_hooks');
if(!process.argv[2])throw Error('Usage: node --expose-gc scripts/benchmark-agent-evidence.cjs /path/to/baseline.cjs');
const before=require(path.resolve(process.argv[2])),after=require('../codingagentlib/javascript/loop.js');
const events=Array.from({length:50000},(_,i)=>({kind:'observation',value:{id:'c'+i,tool:i%3?'run_command':'write_file',ok:i%13!==0,result:{exitCode:i%7===0?1:0,path:'src/main.js',timedOut:i%101===0,cancelled:i%211===0}}}));
assert.deepEqual(after.evidence(events),before.evidence(events));
function measure(fn){for(let i=0;i<4;i++)fn(events);const samples=[];for(let i=0;i<15;i++){global.gc?.();const start=performance.now();fn(events);samples.push(performance.now()-start);}return samples.sort((a,b)=>a-b)[7];}
const old=measure(before.evidence),current=measure(after.evidence);console.log(JSON.stringify({events:events.length,beforeMs:old,afterMs:current,speedup:old/current,scope:'Evidence summary aggregation only; no inference/network/tools.'}));
for(let n=0;n<400;n++){const log=events.slice(n,n+1+n%150);assert.deepEqual(after.evidence(log),before.evidence(log));assert.deepEqual(after.evidenceSummary(log),before.evidenceSummary(log));}console.log('PASS: 800 exact evidence and display-summary comparisons.');
