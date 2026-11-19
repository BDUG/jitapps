// Synthetic serialization benchmark; transports and backoff are local no-ops.
const path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module'),{performance}=require('node:perf_hooks');
const repo=path.resolve(__dirname,'../../..'),ref=process.argv[2]||'03eaba4',file='codingagentlib/vscode/src/provider.cjs';
const baseline={exports:{}},source=execFileSync('git',['show',ref+':'+file],{cwd:repo,encoding:'utf8'});
vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(createRequire(path.join(repo,file)),baseline,baseline.exports);
const before=baseline.exports.completeWithRetry,after=require('../src/provider.cjs').completeWithRetry;
const dataUrl='data:image/png;base64,'+Buffer.alloc(1500000,97).toString('base64');
// Isolate payload preparation from changes to the default agent prompt.
const request={purpose:'specification',instructions:['Inspect references and return one JSON plan.'],sessionId:'benchmark',step:1,goal:'Synthetic request',events:[{kind:'user',value:{status:'reference_files',attachments:[{name:'source.txt',content:'x'.repeat(1500000)},{name:'image.png',path:'image.png',mimeType:'image/png',dataUrl}]}}]};
const config={endpoint:'https://benchmark.invalid/chat',transport:'openai',model:'synthetic',maxModelRetries:2};
async function run(fn,capture=false){let calls=0,bodyBytes=0;const bodies=[];await fn(config,'',request,null,{sleep:async()=>{},transport:async(_url,options)=>{calls++;bodyBytes=Buffer.byteLength(options.body);if(capture)bodies.push(options.body);return calls<3?new Response('{}',{status:503}):Response.json({choices:[{message:{content:'{"status":"ask"}'}}]});}});assert.equal(calls,3);return {bodies,bodyBytes};}
(async()=>{
 const oldResult=await run(before,true),newResult=await run(after,true);assert.deepEqual(newResult,oldResult);
 for(let i=0;i<2;i++){await run(before);await run(after);}
 const old=[],fresh=[],sample=async(fn,list)=>{const t=performance.now();await run(fn);list.push(performance.now()-t);};
 for(let i=0;i<9;i++){if(i%2){await sample(after,fresh);await sample(before,old);}else{await sample(before,old);await sample(after,fresh);}}
 const median=a=>a.sort((a,b)=>a-b)[4],beforeMs=median(old),afterMs=median(fresh);
 console.log(JSON.stringify({baseline:ref,node:process.version,attempts:3,bodyBytes:newResult.bodyBytes,beforeMs,afterMs,speedup:beforeMs/afterMs,note:'Local request processing with simulated transient failures; excludes network latency, model generation and real backoff delays.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
