const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Worker}=require('../src/worker.cjs'),{Controller}=require('../src/controller.cjs');const binary=path.resolve(__dirname,'../bin/codingagent-worker'+(process.platform==='win32'?'.exe':''));
async function fixture(t,commands=[]){const root=await fs.mkdtemp(path.join(os.tmpdir(),'vscode-native-'));const worker=new Worker(binary,root,commands);t.after(async()=>{await worker.close();await fs.rm(root,{recursive:true,force:true});});return {root,worker};}
test('native extension resolves missing executable paths while preserving permissions', {skip:process.platform==='win32'}, async t => {
  const {worker} = await fixture(t, ['/obsolete/agent-install/sh']);
  const controller = new Controller(worker, async request => {
    const observations = request.events.filter(event => event.kind === 'observation').map(event => event.value);
    if (observations.length) {
      assert.equal(observations[0].ok, true);
      assert.equal(observations[0].result.exitCode, 0);
      assert.equal(observations[0].result.stdout, 'resolved');
      assert.ok(path.isAbsolute(observations[0].result.resolvedExecutable));
    }
    return {sessionId:request.sessionId, step:request.step, status:observations.length?'done':'act',
      plan:'Verify relocated executable', action:observations.length?null:{tool:'run_command',args:{command:'/missing/sh',args:['-c','printf resolved']}},
      summary:'Verified the relocated command'};
  });
  assert.equal((await controller.run('Verify command resolution', {commands:true})).status, 'complete');
  const denied = new Controller(worker, async request => ({sessionId:request.sessionId,step:request.step,status:'act',
    plan:'Check command permission',action:{tool:'run_command',args:{command:'/missing/sh',args:['-c','printf denied']}}}));
  await denied.run('Command disabled', {}, 1);
  const session = await worker.dispatch({op:'session',session:denied.session});
  assert.match(session.events.find(event => event.kind === 'observation').value.error, /allowCommands/);
});
test('native extension loop writes, repairs identities, resumes question and exports completed ZIP',async t=>{const {root,worker}=await fixture(t);const trace=[];let invalid=true;const controller=new Controller(worker,async request=>{if(invalid){invalid=false;return {sessionId:'wrong',step:request.step};}const observed=request.events.some(e=>e.kind==='observation');return {sessionId:request.sessionId,step:request.step,status:observed?'done':'act',plan:'Write native result',action:observed?null:{tool:'write_file',args:{path:'result.txt',content:'native extension',expectedHash:'missing'}},summary:'File written; commands disabled'};},e=>trace.push(e));const result=await controller.run('Write result',{edits:true});assert.equal(result.status,'complete');assert.equal(await fs.readFile(path.join(root,'result.txt'),'utf8'),'native extension');assert.equal((await worker.dispatch({op:'session',session:controller.session})).status,'complete');const archive=await worker.call('package',{session_id:controller.session});assert.deepEqual([...((await fs.readFile(archive.path)).subarray(0,2))],[80,75]);assert.equal((await worker.dispatch({op:'session',session:controller.session})).status,'complete');assert.ok(trace.some(e=>e.kind==='plan'));assert.ok(trace.some(e=>e.kind==='result'&&e.result.status==='retry'));const health=await worker.dispatch({op:'health'});assert.equal(health.requiresPython,false);
let n=0;const questions=new Controller(worker,async r=>n++?{sessionId:r.sessionId,step:r.step,status:'done',plan:'Answer observed',action:null,summary:'Answered'}:{sessionId:r.sessionId,step:r.step,status:'ask',plan:'Clarify',action:null,question:'Which file?'});assert.equal((await questions.run('Ask')).status,'waiting');assert.equal((await questions.run('result.txt',{},5,true)).status,'complete');
});
test('read-only permissions and step budgets are enforced by native runtime',async t=>{const {root,worker}=await fixture(t);const c=new Controller(worker,async r=>({sessionId:r.sessionId,step:r.step,status:'act',plan:'Attempt write',action:{tool:'write_file',args:{path:'denied.txt',content:'bad',expectedHash:'missing'}}}));const result=await c.run('Read only',{},1);assert.equal(result.reason,'step_budget');await assert.rejects(fs.access(path.join(root,'denied.txt')));});
test('out-of-band Stop interrupts an actual native command', {skip:process.platform==='win32'},async t=>{const {worker}=await fixture(t,['/bin/sh']);const c=new Controller(worker,async r=>({sessionId:r.sessionId,step:r.step,status:'act',plan:'Long command',action:{tool:'run_command',args:{command:'/bin/sh',args:['-c','sleep 30'],timeout:10000}}}));const run=c.run('Stop command',{commands:true},5);while(!c.session)await new Promise(r=>setTimeout(r,5));await new Promise(r=>setTimeout(r,60));const start=Date.now();await c.stop();const result=await run;assert.equal(result.reason,'cancelled');assert.ok(Date.now()-start<2500);});
test('task progress can be completed on the final reply and references are persisted',async t=>{const {worker}=await fixture(t);const events=[];const c=new Controller(worker,async r=>{const done=r.events.some(e=>e.kind==='observation');assert.ok(r.events.some(e=>e.value?.attachments?.[0]?.content==='reference'));return {sessionId:r.sessionId,step:r.step,status:done?'done':'act',plan:'Inspect with evidence',action:done?null:{tool:'list_files',args:{}},tasks:[{id:'inspect',title:'Inspect workspace',status:done?'done':'in_progress'}],summary:'Inspected'};},e=>events.push(e));assert.equal((await c.run('Inspect',{},4,false,[{name:'reference.txt',content:'reference'}])).status,'complete');assert.deepEqual(events.filter(e=>e.kind==='tasks').map(e=>e.tasks[0].status),['in_progress','done']);});
test('null model replies use bounded native repair instead of crashing the controller',async t=>{const {worker}=await fixture(t);const c=new Controller(worker,async()=>null);const result=await c.run('Invalid replies',{},5);assert.equal(result.status,'waiting');assert.equal(result.invalidPlans,3);assert.match(result.error,/identifiers/);});

test('native worker launcher resolves missing paths and fails promptly for missing programs', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-resolution-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const oldPath = process.env.PATH;
  process.env.PATH = path.dirname(binary) + path.delimiter + (oldPath || '');
  try {
    const worker = new Worker(path.join(root, 'missing', path.basename(binary)), root);
    try { assert.equal((await worker.dispatch({op:'health'})).requiresPython, false); }
    finally { await worker.close(); }
    assert.throws(() => new Worker(path.join(root,'no-such-worker-resolution-test'),root), {code:'ENOENT'});
  } finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
  }
});

test('failed worker spawn rejects subsequent requests without hanging', {skip:process.platform==='win32', timeout:3000}, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-spawn-failure-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const executable = path.join(root, 'broken-worker');
  await fs.writeFile(executable, '#!/no/such/worker-interpreter\n', {mode:0o700});
  const worker = new Worker(executable, root);
  try {
    await assert.rejects(worker.dispatch({op:'health'}), /ENOENT|exited|EPIPE/);
    await assert.rejects(worker.dispatch({op:'health'}), /ENOENT|exited|EPIPE/);
  } finally { await worker.close(); }
});
