'use strict';
const assert=require('node:assert/strict'),{queryGraph}=require('./graph-memory'),fixtures=require('../conformance/graph-query-v1.json');
for(const test of fixtures.cases){
 if(!test.valid){assert.throws(()=>queryGraph(fixtures.graph,test.options),undefined,test.name);continue;}
 const result=queryGraph(fixtures.graph,test.options);assert.equal(result.fallbackUsed,test.expected.fallbackUsed,test.name+' fallback');
 assert.deepEqual(result.nodes.map(n=>n.id),test.expected.nodes,test.name+' nodes');assert.deepEqual(result.seeds,test.expected.seeds,test.name+' seeds');assert.deepEqual(result.edges.map(e=>e.id),test.expected.edges,test.name+' edges');assert.deepEqual(Object.keys(result.annotations).sort(),[...test.expected.annotations].sort(),test.name+' notes');
 assert.ok(result.seeds.every(id=>result.nodes.some(n=>n.id===id)),test.name+' seeds belong to returned nodes');
}
const options={nodeIds:['a'],hops:0},result=queryGraph(fixtures.graph,options);result.nodes[0].label='Changed';result.annotations.a.text='Changed';result.warnings.push('Changed');result.seeds.length=0;assert.equal(options.nodeIds.length,1);assert.equal(fixtures.graph.nodes.find(n=>n.id==='a').label,'Überprüfung');assert.equal(fixtures.graph.annotations.a.text,'prüfen');assert.equal(fixtures.graph.warnings.length,1);
console.log('PASS shared graph-query conformance: Unicode label/property search, empty matches, deterministic ranking/traversal, unique bounded seeds, filters and immutable annotated results.');
