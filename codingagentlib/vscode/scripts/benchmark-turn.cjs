// Local host-work benchmark; no model/provider calls. Timings are diagnostic, not CI thresholds.
const {performance}=require('node:perf_hooks');
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const ref=process.argv[2]||'2ef4922';
function baseline(file){
  const source=execFileSync('git',['show',ref+':codingagentlib/vscode/src/'+file],{cwd:root,encoding:'utf8'});
  const module={exports:{}};
  vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(createRequire(path.join(root,'codingagentlib/vscode/src',file)),module,module.exports);
  return module.exports;
}
const before=baseline('loop-guard.cjs'),after=require('../src/loop-guard.cjs');
const vb=baseline('verification.cjs'),va=require('../src/verification.cjs');
function compare(oldFn,newFn){
  for(let i=0;i<5;i++){oldFn();newFn();}
  const old=[],fresh=[];
  const sample=(fn,list)=>{const t=performance.now();for(let i=0;i<5;i++)fn();list.push((performance.now()-t)/5);};
  for(let i=0;i<11;i++){if(i%2){sample(newFn,fresh);sample(oldFn,old);}else{sample(oldFn,old);sample(newFn,fresh);}}
  const median=a=>a.sort((a,b)=>a-b)[5],beforeMs=median(old),afterMs=median(fresh);
  return {beforeMs,afterMs,speedup:beforeMs/afterMs};
}
const events=[];
for(let step=1;step<=500;step++){
  const action={tool:'read_file',args:{path:'src/file'+step+'.js'}};
  events.push({kind:'assistant',value:{sessionId:'s',step,status:'act',action}},{kind:'observation',value:{id:'s_'+step,tool:'read_file',ok:true,result:{text:'sample source\n'.repeat(4500),hash:String(step)}}});
}
const next={tool:'read_file',args:{path:'next.js'}};
const equal=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
equal(after.review(events,next),before.review(events,next));
const turn=compare(()=>{before.review(events);before.review(events,next);},()=>{const reviewer=after.createReviewer(events);reviewer();reviewer(next);});
const policy=Array.from({length:100},(_,i)=>({name:'check'+i,command:'node',args:['test'+i+'.js']}));
const commands=[];
for(let step=1;step<=500;step++)commands.push({kind:'assistant',value:{sessionId:'s',step,status:'act',action:{tool:'run_command',args:{command:'node',args:['test'+(step%100)+'.js']}}}},{kind:'observation',value:{id:'s_'+step,tool:'run_command',ok:true,result:{exitCode:0}}});
equal(va.evaluate(commands,policy),vb.evaluate(commands,policy));
const verification=compare(()=>vb.evaluate(commands,policy),()=>va.evaluate(commands,policy));
console.log(JSON.stringify({baseline:ref,node:process.version,turn:{receipts:500,recentReceiptTextBytes:1512000,...turn},verification:{receipts:500,checks:100,...verification},note:'Synthetic local host processing only; excludes provider latency, execution and UI rendering.'},null,2));
