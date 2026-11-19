const assert=require('node:assert/strict'),M=require('./model');
const initial=M.demo(),skill={id:'procedure',kind:'skill',label:'Inspect safely',skillId:'inspect',revision:2,position:{x:30,y:20}},flow={...initial,nodes:[skill,...initial.nodes],edges:[{source:'procedure',target:'read'},...initial.edges]};
const workflow=M.workflow(flow);assert.deepEqual(workflow.steps.map(s=>s.id),['read','inspect']);assert.deepEqual(workflow.steps[0].skills,[{id:'inspect',revision:2}]);assert.deepEqual(workflow.steps[1].skills,[{id:'inspect',revision:2}]);assert.deepEqual(M.workflow(M.fromWorkflow(workflow)),workflow);
assert.throws(()=>M.validate({...flow,edges:[...flow.edges,{source:'inspect',target:'procedure'}]}),/cycle/);
const ref=M.copy(initial);ref.nodes[0].args={path:{$step:'inspect',path:'/path'}};assert.throws(()=>M.validate(ref),/cycle/);
const missing=M.copy(initial);missing.nodes[0].args={path:{$step:'unknown'}};assert.throws(()=>M.validate(missing),/missing/);
const pin=M.copy(flow);pin.nodes[0].revision=0;assert.throws(()=>M.validate(pin),/revision/);
const duplicate=M.copy(flow);duplicate.nodes.push({...skill});assert.throws(()=>M.validate(duplicate),/duplicate/);
console.log('PASS graphical skill-flow compilation, inherited skill pins, round-trip, explicit and implicit cycles, missing references and invalid revisions.');
const sparse={format:'suite-tool-workflow/v2',name:'Scoped procedure',description:'Apply the skill to its declared step only',inputs:{},steps:[{id:'read',tool:'read_file',args:{path:'README.md'},checks:[],skills:[{id:'inspect',revision:2}]},{id:'changes',tool:'changes',args:{},checks:[]}]};
const imported=M.fromWorkflow(sparse);assert.equal(imported.format,'codingagentlib/skill-flow-v2');assert.equal(imported.version,2);assert.deepEqual(M.workflow(imported),sparse);
assert.throws(()=>M.validate({...imported,format:'codingagentlib/skill-flow-v1',version:1}),/v2/);
const explicit=M.copy(imported);explicit.nodes.find(n=>n.kind==='skill').scope='downstream';assert.deepEqual(M.workflow(explicit).steps[1].skills,[{id:'inspect',revision:2}]);
const unknownInput=M.copy(initial);unknownInput.nodes[0].args={path:{$input:'absent'}};assert.throws(()=>M.validate(unknownInput),/input is missing/);
const numeric=M.copy(initial);numeric.nodes[0].id=123;assert.throws(()=>M.validate(numeric),/Invalid/);
for(const fixture of require('../../codingagentlib/conformance/workflows-v2.json').cases){
 if(fixture.valid){assert.doesNotThrow(()=>M.validateWorkflow(fixture.definition),fixture.name);assert.doesNotThrow(()=>M.workflow(M.fromWorkflow(fixture.definition)),fixture.name);}
 else{assert.throws(()=>M.validateWorkflow(fixture.definition),undefined,fixture.name);assert.throws(()=>M.fromWorkflow(fixture.definition),undefined,fixture.name);}
}
const badDefault=M.copy(initial);badDefault.inputs={path:{type:'string',default:42}};assert.throws(()=>M.workflow(badDefault),/default/);
const badCheck=M.copy(initial);badCheck.nodes[0].checks=[{path:'/hash',op:'execute',value:true}];assert.throws(()=>M.workflow(badCheck),/Check op/);
const nonfinite=M.copy(initial);nonfinite.nodes[0].args={count:Infinity};assert.throws(()=>M.workflow(nonfinite),/finite JSON/);
console.log('PASS shared JS/Python workflow conformance, input defaults, result checks and finite JSON guards.');
