/* Reviewed workflow records; no runtime execution and no automatic retries. */
(function(root){'use strict';
const M=root.SkillFlowModel||(typeof require==='function'?require('./model'):null),ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
class WorkflowLibrary {
 constructor({request,getId,getFlow,hasPending,apply,onChange=()=>{}}){if([request,getId,getFlow,hasPending,apply,onChange].some(fn=>typeof fn!=='function'))throw Error('Provide workflow library host callbacks');Object.assign(this,{request,getId,getFlow,hasPending,apply,onChange,binding:null,active:null,uncertain:new Map()});}
 id(){const id=this.getId();if(typeof id!=='string'||!ID.test(id))throw Error('Choose a workflow ID');return id;}
 clean(){if(this.hasPending())throw Error('Apply or discard pending fields before using the workflow library');}
 definition(flow=this.getFlow()){return M.workflow(flow);}
 record(value,id){if(!value||value.id!==id||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.enabled!=='boolean')throw Error('Invalid workflow record identity, revision or enabled status');const flow=M.fromWorkflow(value.definition);return {id,revision:value.revision,enabled:value.enabled,flow,signature:canonical(this.definition(flow))};}
 inspect(){const id=this.getId(),binding=this.binding?.id===id?this.binding:null;let differs=!!binding;if(binding&&!this.hasPending()){try{differs=canonical(this.definition())!==binding.signature;}catch{}}return {busy:!!this.active,binding:binding?{id:binding.id,revision:binding.revision,enabled:binding.enabled}:null,requiresReload:this.uncertain.has(id),canRetryCreation:this.uncertain.get(id)===0,changed:differs||this.hasPending()};}
 detach(){this.binding=null;this.onChange();}
 async load(){
  this.clean();if(this.active)throw Error('A workflow library request is already in progress');const id=this.id(),baseline=JSON.stringify(this.getFlow()),ticket={id,op:'read'};this.active=ticket;this.onChange();
  try{const value=await this.request('read',{workflowId:id}),record=this.record(value,id);if(this.getId()!==id||this.hasPending()||JSON.stringify(this.getFlow())!==baseline)throw Error('Flow or workflow ID changed while loading. Your current draft is unchanged.');this.apply(record.flow);this.binding=record;this.uncertain.delete(id);return {...record};}
  finally{if(this.active===ticket)this.active=null;this.onChange();}
 }
 async save({onlyIfMissing=false}={}){
  this.clean();if(this.active)throw Error('A workflow library request is already in progress');const id=this.id();if(this.uncertain.has(id)&&!onlyIfMissing)throw Error('The previous save is uncertain. Load this workflow before saving again.');if(onlyIfMissing&&this.uncertain.get(id)!==0)throw Error('Only an uncertain new-ID save can retry creation');
  const definition=this.definition(),signature=canonical(definition),binding=this.binding?.id===id?this.binding:null,expected=onlyIfMissing?0:binding?.revision||0,enabled=binding?.enabled??true;if(expected>2**31)throw Error('Workflow revision exceeds the runtime limit');const ticket={id,op:'save'};this.active=ticket;this.onChange();let dispatched=false;
  try{dispatched=true;const value=await this.request('save',{workflowId:id,definition:M.copy(definition),expectedRevision:expected,enabled}),record=this.record(value,id);if(record.revision!==expected+1||record.enabled!==enabled||record.signature!==signature)throw Error('Workflow save acknowledgement does not match the submitted revision, definition and enabled status');this.binding=record;this.uncertain.delete(id);return {id,revision:record.revision,enabled,changed:this.getId()!==id||this.inspect().changed};}
  catch(error){if(dispatched&&error.rejected!==true){this.uncertain.set(id,expected);throw Object.assign(Error('Workflow save may have completed. Load the library before retrying. '+error.message),{uncertain:true});}throw error;}
  finally{if(this.active===ticket)this.active=null;this.onChange();}
 }
}
root.SkillFlowLibrary=WorkflowLibrary;if(typeof module==='object')module.exports=WorkflowLibrary;
})(typeof window==='object'?window:globalThis);
