const assert=require('node:assert/strict'),M=require('./model.js'),S=require('../sketchiX/model.js');const m=M.starter(),root=M.rootTopic(m);assert.equal(m.nodes.length,8);assert.equal(M.visible(m).length,8);assert.deepEqual(M.validate(m),m);const copy=JSON.stringify(m);const collapsed=M.validate(m);collapsed.nodes.find(n=>n.id==='discover').collapsed=true;assert.equal(M.visible(collapsed).length,6);assert.equal(M.descendants(m,'discover').length,2);
for(const mode of ['balanced','left','right']){const laid=M.layout({...m,layout:mode});const ns=M.visible(laid);assert.ok(ns.every((a,i)=>ns.every((b,j)=>i===j||a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y)),mode+' no overlap');}
for(const bad of [{...m,nodes:[]},{...m,nodes:[...m.nodes,root]},{...m,nodes:m.nodes.map(n=>n.id==='discover'?{...n,parent:'missing'}:n)},{...m,nodes:m.nodes.map(n=>n.id===root.id?{...n,parent:'discover'}:n)},{...m,nodes:m.nodes.map(n=>({...n,url:'javascript:alert(1)'}))},{...m,nodes:m.nodes.map(n=>({...n,priority:1.5}))}])assert.throws(()=>M.validate(bad));
for(const scope of ['all','visible','branch']){const graph=S.validate(M.diagram(collapsed,scope,'discover','pptx'));assert.ok(graph.width<=3000&&graph.height<=3000);if(scope==='all')assert.equal(graph.nodes.length,8);if(scope==='visible')assert.equal(graph.nodes.length,6);if(scope==='branch')assert.equal(graph.nodes.length,3);assert.equal(graph.edges.length,graph.nodes.length-1);}
assert.equal(JSON.stringify(m),copy);console.log('PASS: tree/schema validation, cycles/orphans/unsafe links, collapse, non-overlap layouts, branch scopes and diagram conversion.');

const linked=M.validate({...m,relationships:[{id:'r1',source:'discover',target:'shape',label:'informs'}],nodes:m.nodes.map(n=>n.id==='discover'?{...n,owner:'Ada',dueDate:'2026-12-31'}:n)});
assert.equal(linked.nodes.find(n=>n.id==='discover').owner,'Ada');
assert.equal(M.diagram(linked).edges.filter(e=>e.dashed&&e.arrow).length,1);
assert.equal(M.diagram(linked,'branch','discover').edges.filter(e=>e.dashed).length,0);
for(const r of [{id:'x',source:'discover',target:'discover'},{id:'x',source:'missing',target:'shape'}])assert.throws(()=>M.validate({...m,relationships:[r]}));
assert.throws(()=>M.validate({...linked,relationships:[...linked.relationships,...linked.relationships]}));
assert.throws(()=>M.validate({...m,nodes:m.nodes.map(n=>({...n,dueDate:'2026-02-30'}))}));
console.log('PASS: task dates, relationship integrity and scoped relationship exports.');
const visual=M.validate({...m,nodes:m.nodes.map(n=>n.id==='discover'?{...n,image:'data:image/png;base64,YWJj',branchLine:{color:'#123456',style:'dotted',width:5}}:n),relationships:[{id:'styled',source:'discover',target:'shape',label:'Supports',color:'#abcdef',style:'solid',width:4}]});
const exported=M.diagram(visual);
assert.equal(exported.edges.find(e=>e.id==='branch-discover').lineStyle,'dotted');
assert.equal(exported.edges.find(e=>e.id==='relationship-styled').color,'#abcdef');
assert.ok(exported.nodes.some(n=>n.shape==='image'&&n.src==='data:image/png;base64,YWJj'));
assert.deepEqual(M.validate(visual),visual);
for(const change of [{image:'https://example.org/image.png'},{image:'data:image/svg+xml;base64,YWJj'},{branchLine:{color:'#123456',style:'invalid',width:2}},{branchLine:{color:'#123456',style:'solid',width:0}}])assert.throws(()=>M.validate({...m,nodes:m.nodes.map(n=>n.id==='discover'?{...n,...change}:n)}));
console.log('PASS: embedded images, styled branch/relationship exports, persistence and invalid image/style rejection.');
