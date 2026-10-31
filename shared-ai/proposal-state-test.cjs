const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/chat.js','utf8');
function extract(name){const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\n}',start)+2);}
test('proposal refresh reads the document once, with a fresh snapshot on the next refresh',()=>{
 let reads=0,current='a';
 const context=vm.createContext({signature:()=>{reads++;return current;}});
 vm.runInContext(extract('proposalStates')+'\n'+source.match(/function proposalStatus\(.*\n/)[0],context);
 const first=context.proposalStates();
 for(let i=0;i<100;i++)assert.equal(first({baseline:'a'}),'pending');
 assert.equal(reads,1);
 current='b';
 assert.equal(context.proposalStates()({baseline:'a'}),'stale');
 assert.equal(reads,2);
 assert.equal(context.proposalStates()({applied:true}),'applied');
 assert.equal(reads,2);
});
