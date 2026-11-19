const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('./model.js'),R=require('./render.js');

test('landscapes validate without losing categories, subcategories, items or settings',()=>{
 const p=M.create(),before=JSON.stringify(p);
 assert.deepEqual(M.validate(p),p);
 assert.equal(JSON.stringify(p),before);
 for(const mutate of [
  v=>{v.categories=[];},
  v=>{v.items[0].categoryId='missing';},
  v=>{v.items[0].maturity='unknown';},
  v=>{v.name='   ';}
 ]){
  const invalid=M.copy(p);
  mutate(invalid);
  assert.throws(()=>M.validate(invalid));
 }
 assert.equal(M.validate(M.create(true)).items.length,1);
});

test('YAML export and import round-trip categories, subcategories, items and maturity',()=>{
 const p=M.create();
 const yaml=M.toLandscapeYaml(p);
 assert.match(yaml,/^landscape:/);
 assert.match(yaml,/Kubernetes/);
 const restored=M.fromLandscapeYaml(yaml,'Roundtrip');
 assert.equal(restored.categories.length,p.categories.length);
 assert.equal(restored.items.length,p.items.length);
 assert.equal(restored.items[0].name,p.items[0].name);
});

test('SVG renderer produces valid standalone vector SVG with embedded metadata',()=>{
 const p=M.create();
 const svg=R.renderSvg(p,{embedProject:true});
 assert.match(svg,/<svg /);
 assert.match(svg,/<cncfix-project /);
 assert.match(svg,/Kubernetes/);
 assert.doesNotMatch(svg,/<script\b/);
});
