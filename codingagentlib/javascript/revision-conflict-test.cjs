const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {LocalRuntime,loop}=require('./index.js');

test('JavaScript SDK retains structured Python conflict recovery without replaying edits',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'sdk-conflict-'));
  const runtime=new LocalRuntime({workspace:folder,commands:[]});
  try{
    await fs.writeFile(path.join(folder,'source.txt'),'external work');
    const session=await runtime.dispatch({op:'start',goal:'Adapt safely',allowEdits:true});
    const invoke=(tool,args,callId)=>runtime.dispatch({op:'tool',session:session.id,tool,args,callId});
    const conflict=await invoke('write_file',{path:'source.txt',content:'lost',expectedHash:'missing'},'stale');
    assert.equal(conflict.ok,false);
    assert.equal(conflict.code,'file_revision_conflict');
    assert.equal(conflict.recovery.automaticRetry,false);
    assert.deepEqual(conflict.recovery.nextAction,{tool:'read_file',args:{path:'source.txt'}});
    assert.equal(await fs.readFile(path.join(folder,'source.txt'),'utf8'),'external work');
    const state=await runtime.dispatch({op:'session',session:session.id});
    assert.deepEqual(loop.failureRecovery(state.events).recoveryPlan,conflict.recovery);
    // The host deliberately chooses to read; the recovery receipt itself does nothing.
    const read=await invoke('read_file',{path:'source.txt'},'refresh');
    const adapted=await invoke('replace_text',{path:'source.txt',find:'external work',replacement:'external work plus change',expectedHash:read.result.hash},'adapt');
    assert.equal(adapted.ok,true);
    assert.equal(await fs.readFile(path.join(folder,'source.txt'),'utf8'),'external work plus change');
  }finally{await runtime.close();await fs.rm(folder,{recursive:true,force:true});}
});
