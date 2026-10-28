const assert=require('node:assert/strict'),T=require('./model-transport.js');
(async()=>{
 const options={retries:2,random:()=>0,sleep:async ms=>delays.push(ms),onRetry:e=>events.push(e)},delays=[],events=[];let count=0;
 const args=['/api/chat',{body:'immutable plan request'}],result=await T.run(async(...received)=>{assert.deepEqual(received,args);count++;return new Response('{}',{status:count<3?503:200,headers:{'Retry-After':'0'}});},args,options);assert.equal(result.status,200);assert.equal(count,3);assert.deepEqual(delays,[0,0]);assert.equal(events[1].attempt,2);
 count=0;await T.run(async()=>{count++;return new Response('{}',{status:401});},args,options);assert.equal(count,1);
 count=0;await T.run(async()=>{count++;return new Response('{}',{status:429,headers:{'Retry-After':'60'}});},args,options);assert.equal(count,1);
 count=0;await assert.rejects(()=>T.run(async()=>{count++;throw new TypeError('Failed to fetch');},args,options),/Failed to fetch/);assert.equal(count,3);
 count=0;await T.run(async()=>{count++;return new Response('{}',{status:500});},args,{retries:0});assert.equal(count,1);
 const controller=new AbortController();let attempts=0;await assert.rejects(()=>T.run(async()=>{attempts++;return new Response('{}',{status:502});},['/api/chat',{signal:controller.signal}],{onRetry:()=>controller.abort()}),e=>e.name==='AbortError');assert.equal(attempts,1);
 const waiting=new AbortController();let reachedWait;const ready=new Promise(resolve=>reachedWait=resolve);const waitRun=T.run(async()=>new Response('{}',{status:503}),['/api/chat',{signal:waiting.signal}],{onRetry:()=>reachedWait()});await ready;waiting.abort();await assert.rejects(waitRun,e=>e.name==='AbortError');
 assert.equal(T.retryAfter('-1'),null);assert.equal(T.retryAfter('bad header'),null);assert.equal(T.retryAfter('Tue, 27 Oct 2026 12:00:03 GMT',Date.parse('2026-10-27T12:00:00Z')),3000);
 console.log('PASS model transport: bounded attempts, retry-after seconds/dates, cooldown, auth exclusion, network recovery and cancelable backoff.');
})().catch(e=>{console.error(e);process.exitCode=1;});
