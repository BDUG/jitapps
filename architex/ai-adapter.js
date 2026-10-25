(function(){
'use strict';
const clone=Architex.clone,catalog=ArchitexHandover.bundledSchemas();
// Chat edits contain model sections, not file-exchange workspace envelopes.
const modelSchemas={metamodel:clone(catalog.schemas.agentRequest.properties.metamodel),instanceModel:clone(catalog.schemas.agentRequest.properties.instanceModel)};
const documentSchema={type:'object',additionalProperties:false,required:['metamodel','instanceModel','ruleLibrary'],properties:{...modelSchemas,ruleLibrary:catalog.schemas.ruleLibrary}};
function snapshot(){
 const m=Architex.validate(clone(model));
 return {metamodel:{name:m.name,components:m.components,dependencies:m.dependencies},instanceModel:{instances:m.instances,connections:m.connections},ruleLibrary:ArchitexScripting.exportLibrary()};
}
function candidate(value){
 if(!value||Object.keys(value).some(k=>!['metamodel','instanceModel','ruleLibrary'].includes(k))||!value.metamodel||!value.instanceModel||!value.ruleLibrary)throw Error('Provide the complete metamodel, instance model and rule library.');
 const next=ArchitexAI.candidate(model,ArchitexScripting.exportLibrary(),value);if(directDiagram()&&(next.model.instances.length||next.model.connections.length))throw Error('Direct diagrams cannot contain typed instances.');return next;
}
function normalize(value,before){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).some(k=>!['metamodel','instanceModel','ruleLibrary'].includes(k)))throw Error('Architecture proposal must contain metamodel, instanceModel or ruleLibrary edits.');
 const result=clone(before);
 for(const [key,fields] of [['metamodel',['name','components','dependencies']],['instanceModel',['instances','connections']]]){
  if(!Object.hasOwn(value,key))continue;
  const section=value[key];
  if(!section||typeof section!=='object'||Array.isArray(section)||!Object.keys(section).length||Object.keys(section).some(k=>!fields.includes(k)))throw Error('Invalid '+key+' edit. Use '+fields.join(', ')+'.');
  for(const field of Object.keys(section)){
   if(field!=='name'&&!Array.isArray(section[field]))throw Error(key+'.'+field+' must be a complete array; omit it to preserve existing entries.');
   result[key][field]=clone(section[field]);
  }
 }
 if(Object.hasOwn(value,'ruleLibrary'))result.ruleLibrary=clone(value.ruleLibrary);
 return result;
}
function validate(value,before=snapshot()){const normalized=normalize(value,before);Architex.checkSchema(normalized,documentSchema);const next=candidate(normalized);if(directDiagram()&&(next.model.instances.length||next.model.connections.length))throw Error('Direct diagrams cannot contain typed instances. Edit components and dependencies only.');return {metamodel:{name:next.model.name,components:next.model.components,dependencies:next.model.dependencies},instanceModel:{instances:next.model.instances,connections:next.model.connections},ruleLibrary:next.library};}
async function beforeApply(value){if(directDiagram()&&(value.instanceModel.instances.length||value.instanceModel.connections.length))throw Error('Direct diagrams use components and dependencies without typed instances.');
 const next=candidate(value),before=await ArchitexScripting.checkCandidate(model),after=await ArchitexScripting.checkCandidate(next.model,next.library);
 const previous=new Set(before.map(i=>i.ruleId+'|'+i.connectionId+'|'+i.message));
 const rejected=after.find(i=>i.scriptError||(i.blocksConnection&&!previous.has(i.ruleId+'|'+i.connectionId+'|'+i.message)));
 if(rejected)throw Error(rejected.message);
}
function apply(value){
 const next=candidate(value);checkpoint();model=next.model;ArchitexScripting.replaceLibrary(next.library,{activate:true});selected=null;selectedEdge=null;pending=null;commit();fit();
}
function restore(value){
 const next=clone(model);Object.assign(next,value.metamodel,value.instanceModel);if(directDiagram()&&(next.instances.length||next.connections.length))throw Error('Switch to Metamodel and instances to restore typed instance content.');Architex.validate(next);ArchitexRuleLibrary.validate(value.ruleLibrary);checkpoint();model=next;ArchitexScripting.replaceLibrary(value.ruleLibrary,{activate:true});selected=null;selectedEdge=null;pending=null;commit();fit();
}
const instructions='Architecture specialist: modelSchemas.metamodel and modelSchemas.instanceModel are the authoritative schemas for document sections. proposalSchema permits omitted unchanged fields. Do not use the file-exchange metamodel/instances schemas from the reference catalogue for chat proposals; those require workspace wrappers not used here. Check every returned entity against its model section schema and preserve cross-model references. Distinguish metamodel connection-policy ports from independent instance data points. Preserve stable IDs, containment, parameters, colors, icons and unrelated entities. Proposals edit the {metamodel,instanceModel,ruleLibrary} document. You may omit unchanged sections or fields; they are retained from the request snapshot. Every supplied array replaces that entire collection: include all retained entries. An explicit empty array deletes that collection and must leave valid references. Do not return operation objects or partial array entries. New or modified scripts must be disabled for review. Never execute scripts yourself. Explain requirements, acceptance criteria, implementation plan, validation plan and assumptions in answer.';
window.SuiteAgentAdapter={
 name:'architex',contextLabel:'metamodel, instance model and validation rules',
 placeholder:'Explain this architecture, resolve a validation issue or propose a model change…',
 relayStorage:'architex-relay-url-v1',instructions,
 schema:{type:'object',additionalProperties:false,minProperties:1,properties:{metamodel:{...modelSchemas.metamodel,required:[],minProperties:1},instanceModel:{...modelSchemas.instanceModel,required:[],minProperties:1},ruleLibrary:catalog.schemas.ruleLibrary}},
 contextSchema:catalog,modelSchemas,
 prepareInstructions:async request=>(directDiagram()?'DIRECT DIAGRAM MODE: This workspace is a direct architecture graph, with no separate metamodel or instance creation. The metamodel.components/dependencies fields are the interchange representation of diagram nodes/edges, not prerequisite type definitions. Edit these directly; keep instanceModel.instances and connections empty. Do not create instance component types or instance ports. ':'')+instructions+'\n'+await ArchitexHandover.render(request,window.ArchitexAgentGuide),
 selection:()=>({modelingStyle,mode,nodeId:selected,edgeId:selectedEdge,validation:validationIssues(model)}),
 snapshot,validate,beforeApply,apply,restore
};
})();
