'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DirectorySessionStore}=require('./node-store.js');
const {createAgent}=require('./core.js');
(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sdk-private-store-'));
  try {
    const first=new DirectorySessionStore(root),second=new DirectorySessionStore(root);
    assert.equal(await first.acquire('tenant','id','owner'),true);
    assert.equal(await second.acquire('tenant','id','other'),false);
    await first.save('tenant','id',{value:'private'},0);
    assert.equal(await second.load('foreign','id'),null);
    await assert.rejects(first.save('tenant','id',{},0),/revision/);
    await second.release('tenant','id','other');assert.equal(await second.acquire('tenant','id','other'),false);
    await first.release('tenant','id','owner');assert.equal(await second.acquire('tenant','id','other'),true);await second.release('tenant','id','other');
    const reply=r=>({sessionId:r.sessionId,step:r.step,plan:'Ask then resume',status:'ask',action:null,question:'Continue?'});
    const agent=createAgent({model:reply,sessionStore:first});const result=await agent.run('Persist');assert.equal(result.status,'waiting');
    const resumed=createAgent({model:r=>({...reply(r),status:'done',summary:'Resumed'}),sessionStore:second});assert.equal((await resumed.resume(result.sessionId)).status,'complete');
    console.log('PASS private directory sessions: durable resume, tenant isolation, leases and revision conflicts.');
  } finally {await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
