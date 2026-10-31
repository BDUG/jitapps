const {test}=require('node:test');
const assert=require('node:assert/strict');
const Q=require('./hub-core.js');
test('multiword inventory search serializes each row once and keeps complete values',()=>{
 let serializations=0;
 const rows=[{name:'Alpha',description:'Beta',toJSON(){serializations++;return {name:this.name,description:this.description};}}];
 assert.equal(Q.inventory(rows,{query:'ALPHA beta'}).matched,1);assert.equal(serializations,1);
 Q.inventory(rows);assert.equal(serializations,1);
});
test('numeric label sorting remains stable without changing source order',()=>{
 const rows=[{name:'Node 10'},{name:'Node 2'},{name:'Node 2'},{name:'Node 1'}];
 const result=Q.inventory(rows,{sort:'label',limit:2,offset:2});
 assert.deepEqual(result.all.map(entry=>entry.index),[3,1,2,0]);
 assert.deepEqual(result.entries.map(entry=>entry.index),[2,0]);
 assert.deepEqual(rows.map(row=>row.name),['Node 10','Node 2','Node 2','Node 1']);
});
