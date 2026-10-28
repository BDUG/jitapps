/** Host integration example. No provider or command execution is built in. */
const {EmbeddedAgent,ContextRegistry}=require('../javascript');
const copy=v=>JSON.parse(JSON.stringify(v));
function createEditorIntegration({readProject,readSelection,documentSchema,validate,review,onEvent=()=>{},canPropose=()=>true}) {
 if([readProject,readSelection,validate,review,onEvent,canPropose].some(fn=>typeof fn!=='function'))throw Error('Provide host callbacks');
 const contexts=new ContextRegistry({base:{application:'custom-code-editor',takeover:'host-review'}})
  .add('project',()=>readProject(),{description:'Current project, revision and document schema',schema:documentSchema})
  .add('selection',()=>readSelection(),{description:'Current editor selection'});
 const agent=new EmbeddedAgent({contextProvider:contexts.provider(),onEvent,
  toolAvailable:(tool)=>tool.name!=='propose_project'||canPropose()===true})
  .addTool('read_project',()=>readProject(),{description:'Refresh the current native project and revision'})
  .addTool('propose_project',async(args,turn)=>{
   const expected=turn.context.sources.find(s=>s.id==='project').revision;
   if(args.expectedRevision!==expected||(await readProject()).revision!==expected)throw Error('Project changed. Refresh context and adapt the proposal.');
   const document=await validate(copy(args.document));
   if((await readProject()).revision!==expected)throw Error('Project changed during validation. Refresh and adapt.');
   // Host queues a preview. Its later Apply action must compare-and-swap the revision.
   return review({document:copy(document),expectedRevision:expected,callId:turn.callId});
  },{permission:'edits',description:'Validate and stage a complete project for host review. Does not mean applied.',parameters:{type:'object',required:['expectedRevision','document'],properties:{expectedRevision:{type:'string'},document:documentSchema}}});
 return {agent,contexts};
}
module.exports={createEditorIntegration};
if(require.main===module)(async()=>{
 const project={revision:'1',data:{name:'Demo',files:[{path:'README.md',content:'Hello'}]}},pending=[];
 const {agent}=createEditorIntegration({readProject:()=>copy(project),readSelection:()=>({revision:'1',data:{file:'README.md'}}),documentSchema:{type:'object',required:['name','files']},validate:d=>{if(!Array.isArray(d.files))throw Error('Files required');return d;},review:proposal=>{pending.push(proposal);return {queued:true,applied:false};},onEvent:e=>console.log(e.kind)});
 const result=await agent.run({goal:'Propose a README update',allowEdits:true,model:r=>({sessionId:r.sessionId,step:r.step,plan:'Stage a reviewable project update',status:r.step===1?'act':'done',action:r.step===1?{tool:'propose_project',args:{expectedRevision:r.context.sources.find(s=>s.id==='project').revision,document:{name:'Demo',files:[{path:'README.md',content:'Updated README'}]}}}:null,summary:'Proposal queued for host review; not applied.'})});
 console.log(JSON.stringify({result,pending,unchangedProject:project},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
