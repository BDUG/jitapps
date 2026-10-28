const assert=require('node:assert/strict'),{RequestLog}=require('./request-log.js');
(async()=>{
const log=new RequestLog({app:'test',session:()=> 'session'}),body=JSON.stringify({messages:[{content:'actual request'}],apiKey:'secret'});let calls=0;
const transport=async(_url,_options,extra)=>{calls++;if(log.enabled)assert.equal(JSON.parse(_options.body).trace,true);assert.equal(extra,'paging-options');return new Response('{"text":"reply","access_token":"secret"}',{status:200});};
const call=()=>log.wrap(transport)('http://localhost/api/chat?key=secret',{method:'POST',headers:{Authorization:'Bearer secret'},body},'paging-options');
await call();assert.equal(log.entries.length,0);log.enabled=true;const response=await call();assert.equal((await response.json()).text,'reply');assert.equal(calls,2);assert.equal(log.entries[0].sessionId,'session');assert.equal(log.entries[0].endpoint,'http://localhost/api/chat');assert.equal(log.entries[0].request.apiKey,'[REDACTED]');assert.equal(log.entries[0].response.access_token,'[REDACTED]');assert.equal(log.entries[0].status,'complete');assert.ok(!JSON.stringify(log.snapshot()).includes('secret'));
await log.wrap(async()=>new Response('binary',{headers:{'Content-Type':'application/zip'}}))('/api/agent/package');assert.equal(log.entries.at(-1).response.omitted,'Binary response body');
await log.wrap(async()=>new Response('not json',{status:502}))('/api/chat');assert.equal(log.entries.at(-1).status,'http-error');assert.equal(log.entries.at(-1).response,'not json');
await assert.rejects(log.wrap(async()=>{throw new DOMException('Stopped','AbortError');})('/api/agent'),/Stopped/);assert.equal(log.entries.at(-1).status,'cancelled');
let resolve;const pending=log.wrap(()=>new Promise(r=>resolve=r))('/api/chat');assert.equal(log.entries.at(-1).status,'pending');log.clear();resolve(new Response('{}'));await pending;assert.equal(log.entries.length,0);log.enabled=false;await call();assert.equal(log.entries.length,0);
console.log('PASS optional request log: off by default, intact responses, metadata redaction, errors, cancellation, paging options and clear during capture.');
})().catch(e=>{console.error(e);process.exitCode=1;});
