const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('./content-hub-core.js');
test('empty searches never inspect full published text',()=>{
 const item={id:'one',name:'Name',sourceTool:'textiX',publishedAt:'2026-01-01T00:00:00Z',get text(){throw Error('Unnecessary full-text read');}};
 assert.equal(H.matches(item,'  \t '),true);
 assert.equal(H.browse([item]).matched,1);
});
test('normalized multiword matching preserves filters and deterministic ordering',()=>{
 const items=[{id:'b',name:'Ａlpha',sourceTool:'textiX',tags:['Beta'],text:'Notes',publishedAt:'2026-01-01T00:00:00Z'},{id:'a',name:'Alpha',sourceTool:'textiX',tags:['Beta'],text:'Notes',publishedAt:'2026-01-01T00:00:00Z'}];
 assert.deepEqual(H.browse(items,{query:'alpha BETA'}).all.map(item=>item.id),['a','b']);
 assert.equal(H.browse(items,{source:'codeiX'}).matched,0);
 assert.deepEqual(items.map(item=>item.id),['b','a']);
});
