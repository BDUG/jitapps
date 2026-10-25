const assert=require('node:assert/strict'),B=require('./bulk-edit.js'),C=require('./capabilities.js');
const doc={name:'Demo',nodes:[{id:'n',text:'Hello',progress:2},{id:'locked',locked:true,text:'Keep'}],ruleLibrary:[{description:'Protected'}],assets:[{name:'Protected'}]};
assert.deepEqual(B.fields(doc).map(r=>r.path.join('.')),['name','nodes.0.text','nodes.0.progress']);
assert.equal(B.apply(doc,[{path:['nodes','0','text'],value:'Updated'}]).nodes[0].text,'Updated');assert.equal(doc.nodes[0].text,'Hello');
for(const edits of [[{path:['nodes','0','id'],value:'evil'}],[{path:['nodes','1','text'],value:'evil'}],[{path:['nodes','0','progress'],value:'3'}],[{path:['__proto__','text'],value:'evil'}],[{path:['name'],value:'A'},{path:['name'],value:'B'}]])assert.throws(()=>B.apply(doc,edits));
const artwork={elements:[{type:'path',width:1},{type:'text',width:2}]};assert.equal(C.apply('sketchiX sketch','stroke',artwork,'5').elements[0].width,5);assert.equal(C.apply('sketchiX sketch','stroke',artwork,'5').elements[1].width,2);assert.equal(C.inventory('sketchiX sketch',artwork)[0].strokeWidth,1);
console.log('PASS bulk edits: immutable proposals, protected fields and locks, strict types, duplicate/path rejection, actual native stroke width.');
