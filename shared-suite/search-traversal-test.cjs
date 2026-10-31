const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./workspace-core.js');
test('protected sections are skipped before their values are read, including raw source searches',()=>{
 const document={name:'Visible',nodes:[{label:'Visible'}]};
 for(const key of ['assets','media','library','reportSources','ruleLibrary'])Object.defineProperty(document,key,{enumerable:true,get(){throw Error('Protected section was visited: '+key);}});
 assert.equal(C.search(document,'Visible',{code:true}).length,2);
});
test('mutable traversal paths remain independent and preserve field order and scope',()=>{
 const document={nodes:[{label:'First',nested:{description:'Second'}},{label:'Third'}],text:'Last',files:[{content:'Source'}]};
 assert.deepEqual(C.fields(document).map(field=>field.path.join('.')),['nodes.0.label','nodes.0.nested.description','nodes.1.label','text']);
 assert.equal(C.search(document,'Second',{fieldPath:'nested'}).length,1);
 assert.equal(C.search(document,'Source').length,0);
 assert.equal(C.search(document,'Source',{code:true}).length,1);
});
