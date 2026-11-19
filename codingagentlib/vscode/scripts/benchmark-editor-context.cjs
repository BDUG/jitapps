// Compare local context collection against a trusted Git revision. No provider calls.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module'),{performance}=require('node:perf_hooks');
const repo=path.resolve(__dirname,'../../..'),ref=process.argv[2]||'5355f22',file='codingagentlib/vscode/src/editor-context.cjs';
const source=execFileSync('git',['show',ref+':'+file],{cwd:repo,encoding:'utf8'}),moduleBefore={exports:{}};
vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(createRequire(path.join(repo,file)),moduleBefore,moduleBefore.exports);
const before=moduleBefore.exports.collect,after=require('../src/editor-context.cjs').collect;
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'context-benchmark-'));
 try{
  await fs.mkdir(path.join(root,'node_modules'));
  const entries=[];
  for(let i=0;i<500;i++){const file=path.join(root,'file'+i+'.js'),dep=path.join(root,'node_modules','dep'+i+'.js');await fs.writeFile(file,'source');await fs.writeFile(dep,'dependency');const diagnostic={message:'Problem '+i,severity:i%4,range:{start:{line:i,character:0},end:{line:i,character:1}}};entries.push([{scheme:'file',fsPath:file},[diagnostic]],[{scheme:'file',fsPath:dep},[diagnostic]]);}
  const vscode={workspace:{textDocuments:[]},window:{},languages:{getDiagnostics:()=>entries}};
  const comparable=({collectedAt,...value})=>value;
  assert.deepEqual(comparable(await after(vscode,root)),comparable(await before(vscode,root)));
  for(let i=0;i<3;i++){await before(vscode,root);await after(vscode,root);}
  const old=[],fresh=[];
  const sample=async(fn,list)=>{const t=performance.now();await fn(vscode,root);list.push(performance.now()-t);};
  for(let i=0;i<11;i++){if(i%2){await sample(after,fresh);await sample(before,old);}else{await sample(before,old);await sample(after,fresh);}}
  const median=a=>a.sort((a,b)=>a-b)[5],beforeMs=median(old),afterMs=median(fresh);
  console.log(JSON.stringify({baseline:ref,node:process.version,diagnosticFiles:1000,includedFiles:500,excludedDependencies:500,parallelPathChecks:8,beforeMs,afterMs,speedup:beforeMs/afterMs,note:'Local filesystem context collection only; excludes model latency and tool execution. No cross-turn cache.'},null,2));
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
