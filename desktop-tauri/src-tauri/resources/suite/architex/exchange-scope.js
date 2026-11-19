(function(root){
'use strict';
const clone=m=>JSON.parse(JSON.stringify(m));
function kind(m){return m.modelType||(m.components.length&&(m.instances.length||m.connections.length)?'both':m.instances.length||m.connections.length?'instances':'metamodel');}
function exportModel(model,type){if(!['metamodel','instances'].includes(type))throw Error('Choose a model type');const m=clone(model);m.modelType=type;if(type==='metamodel'){m.instances=[];m.connections=[];}else{m.components=[];m.dependencies=[];}if(m.sphinx)m.sphinx=Object.fromEntries(Object.entries(m.sphinx).filter(([k])=>k===type));return m;}
function apply(current,incoming,type,{clearInstances=false}={}){
 const A=root.Architex||(typeof require==='function'?require('./model.js'):null);
 incoming=A.migrate(incoming,current.components);A.checkSchema(incoming,A.schema);
 if(type==='both'){if(incoming.modelType)throw Error('Both models requires a complete workspace. Choose the file’s model scope, or use Both models with a native Mermaid diagram.');const complete=clone(incoming);A.validate(complete);return complete;}
 if(!incoming.modelType&&incoming.components.length&&incoming.instances.length)throw Error('This file contains both models. Select Both models to import the complete workspace.');
 const actual=kind(incoming);if(actual!==type)throw Error('This file contains a '+(actual==='metamodel'?'metamodel':'instance model')+'. Select that model type before importing.');
 const candidate=clone(current);delete candidate.modelType;
 if(type==='metamodel'){
  if(incoming.modelType&& (incoming.instances.length||incoming.connections.length))throw Error('A metamodel exchange cannot contain instances or connections');
  candidate.name=incoming.name;candidate.components=clone(incoming.components);candidate.dependencies=clone(incoming.dependencies);
  if(clearInstances){candidate.instances=[];candidate.connections=[];if(candidate.sphinx)delete candidate.sphinx.instances;}
 }else{
  if(incoming.modelType&&(incoming.components.length||incoming.dependencies.length))throw Error('An instance-model exchange cannot contain metamodel definitions. Use separate metamodel and instance files.');
  candidate.instances=clone(incoming.instances);candidate.connections=clone(incoming.connections);
 }
 if(incoming.sphinx?.[type]){candidate.sphinx??={};candidate.sphinx[type]=clone(incoming.sphinx[type]);}else if(candidate.sphinx)delete candidate.sphinx[type];
 try{A.validate(candidate);}catch(e){throw Error(type==='metamodel'?'Metamodel is incompatible with the retained instances or contains invalid references. You can choose “Clear existing instance model”. '+e.message:'Instance model does not match the active metamodel. '+e.message);}
 return candidate;
}
const api={version:2,kind,exportModel,apply};root.ArchitexScope=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
