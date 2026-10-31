const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./workspace-core.js');
test('dense replacements preserve literal dollar text and do not revisit inserted matches',()=>{
 const source='a.b '.repeat(20000),doc={text:source};
 const result=C.replace(doc,'a.b','$& a.b');
 assert.equal(result.count,20000);assert.equal(result.document.text,'$& a.b '.repeat(20000));
 assert.equal(doc.text,source);
});
test('a reused pattern finds all matches in every field and retains Unicode boundaries',()=>{
 const doc={name:'Élan élan',notes:'élan xélan élan_',description:'élan'};
 const options={wholeWord:true};
 assert.equal(C.search(doc,'élan',options).length,4);
 assert.equal(C.replace(doc,'élan','done',options).count,4);
 assert.equal(C.replace(doc,'élan','done',options).document.notes,'done xélan élan_');
 assert.equal(C.textMatches('xélan','élan',options),false);
 assert.equal(C.textMatches('élan '.repeat(20000),'élan',options),true);
});
