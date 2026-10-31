const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('./multimodal.js');
const file=(name,text)=>({name,type:'text/plain',size:text.length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
test('queued batches preserve removals, concurrent references and unique names',async()=>{
 let items=[{name:'old.txt',kind:'text',content:'Remove me'}],release,started;
 const reading=new Promise(resolve=>started=resolve);
 const delayed={name:'report.txt',type:'text/plain',size:5,arrayBuffer:()=>{started();return new Promise(resolve=>release=()=>resolve(new TextEncoder().encode('First').buffer));}};
 const load=M.fileLoader({current:()=>items,append:batch=>items.push(...batch)});
 const first=load([delayed]),second=load([file('report.txt','Second')]);
 await reading;items=[];items.push({name:'report.txt',kind:'text',content:'Concurrent reference'});release();
 await Promise.all([first,second]);
 assert.equal(items.length,3);assert.ok(!items.some(item=>item.name==='old.txt'));
 assert.equal(new Set(items.map(item=>item.name)).size,3);
 assert.deepEqual(items.map(item=>item.content),['Concurrent reference','First','Second']);
});
test('failed batches remain atomic and later selections can still load',async()=>{
 const items=[],load=M.fileLoader({current:()=>items,append:batch=>items.push(...batch)});
 await assert.rejects(load([file('valid.txt','Valid'),{name:'broken.txt',arrayBuffer:async()=>{throw Error('Read failed');}}]),/Read failed/);
 assert.equal(items.length,0);
 await load([file('next.txt','Next')]);assert.equal(items[0].content,'Next');
});
