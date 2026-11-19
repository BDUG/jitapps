/* Project-scoped, revision-checked memory exchange; RST stays host-owned. */
(function(root){'use strict';
const M=root.RstixModel||(typeof require==='function'?require('./model'):null),copy=M.copy;
class MemorySession {
 constructor({snapshot,isBusy=()=>false,request,onChange=()=>{},timeout=15000}) {
  if(typeof snapshot!=='function'||typeof request!=='function'||!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw Error('Provide memory host callbacks and a bounded timeout');
  Object.assign(this,{snapshot,isBusy,request,onChange,timeout,scope:'',generation:0,preview:null,active:null,revisions:new Map(),reconcile:new Set()});
  this.document=JSON.stringify(snapshot());
 }
 sync() {
  const document=JSON.stringify(this.snapshot());
  if(document!==this.document){this.document=document;this.preview=null;this.generation++;this.active?.controller.abort('The RST project changed');}
 }
 setScope(value) {
  const scope=String(value).trim();this.sync();
  if(scope!==this.scope){this.scope=scope;this.preview=null;this.generation++;this.active?.controller.abort('Project scope changed');}
  this.onChange();
 }
 current(){this.sync();return copy(this.preview||M.knowledge(this.snapshot()));}
 useCurrent(){if(this.active||this.isBusy())throw Error('Finish the current operation first');this.sync();this.preview=null;this.generation++;this.onChange();return this.current();}
 cancel(){this.generation++;this.active?.controller.abort('Memory operation cancelled');}
 guard(ticket) {
  this.sync();
  if(this.active!==ticket||ticket.controller.signal.aborted||ticket.generation!==this.generation||ticket.scope!==this.scope||this.isBusy())throw Error('The project or scope changed; reload memory before continuing');
 }
 checked(value,scope) {
  const graph=M.validateKnowledge(value);
  if(graph.project!==scope||typeof graph.revision!=='string'||!graph.revision||graph.revision.length>200)throw Error('Memory response scope or revision is invalid');
  return graph;
 }
 async run(task) {
  this.sync();
  if(this.active)throw Error('A memory operation is already in progress');
  if(this.isBusy())throw Error('Apply source edits and finish the current operation before working with memory');
  if(!this.scope||this.scope.length>200)throw Error('Choose a project scope (1–200 characters)');
  const ticket={scope:this.scope,generation:this.generation,controller:new AbortController(),writing:false,completed:false};
  this.active=ticket;this.onChange();let timer,stop;
  try {
   const cancelled=new Promise((_,reject)=>{stop=()=>reject(Error(ticket.controller.signal.reason||'Memory operation cancelled'));ticket.controller.signal.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>ticket.controller.abort('Memory request timed out'),this.timeout);});
   return await Promise.race([task(ticket),cancelled]);
  }catch(error){
   if(ticket.writing&&!ticket.completed&&!error.rejected){this.reconcile.add(ticket.scope);throw Error('Memory save may have completed for '+ticket.scope+'. Load its agent memory before retrying. '+error.message);}
   throw error;
  }finally{clearTimeout(timer);ticket.controller.signal.removeEventListener('abort',stop);if(this.active===ticket)this.active=null;this.onChange();}
 }
 async load() {
  return this.run(async ticket=>{
   const value=await this.request({action:'export',project:ticket.scope},ticket.controller.signal);this.guard(ticket);
   const graph=this.checked(value,ticket.scope);this.revisions.set(ticket.scope,graph.revision);this.reconcile.delete(ticket.scope);this.preview=graph;return copy(graph);
  });
 }
 async save() {
  const payload=M.validateKnowledge(this.current());
  return this.run(async ticket=>{
   if(this.reconcile.has(ticket.scope))throw Error('Load this project’s agent memory to reconcile the previous save before retrying');
   let expected=this.revisions.get(ticket.scope);
   if(expected===undefined){
    const value=await this.request({action:'export',project:ticket.scope},ticket.controller.signal);this.guard(ticket);
    const graph=this.checked(value,ticket.scope);
    if(graph.revision!=='missing')throw Error('Agent memory already exists for this scope. Load and review it before replacing it; use “Use open RST graph” to return to local source.');
    expected='missing';
   }
   this.guard(ticket);ticket.writing=true;
   const value=await this.request({action:'import',project:ticket.scope,payload:copy(payload),expectedRevision:expected},ticket.controller.signal),graph=this.checked(value,ticket.scope);ticket.completed=true;
   this.guard(ticket);this.revisions.set(ticket.scope,graph.revision);this.preview=graph;return copy(graph);
  });
 }
 async inspect(read) {
  return this.run(async ticket=>{
   const value=JSON.parse(await read());this.guard(ticket);
   const graph=value.format==='codingagentlib/project-ontology-v1'?M.validateKnowledge({...this.current(),ontology:M.validateOntology(value)}):M.validateKnowledge(value.ontology?value:{...value,ontology:this.current().ontology});
   this.preview=graph;return copy(graph);
  });
 }
}
root.RstixMemorySession=MemorySession;if(typeof module==='object')module.exports=MemorySession;
})(typeof window==='object'?window:globalThis);
