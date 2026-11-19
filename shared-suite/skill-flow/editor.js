/* Same-origin bridge restricted to workflow reads/writes; no execution. */
(function(){'use strict';
const source=document.currentScript.src;
window.SuiteSkillFlowEditor={open({request,session,canEdit=()=>true}={}){
 const dialog=document.createElement('dialog'),frame=document.createElement('iframe'),close=document.createElement('button'),token=crypto.randomUUID(),scope=session?.()?.id;
 let active=false,dirty=false,stored=true,removed=false;
 dialog.style.cssText='width:96vw;max-width:1600px;height:94vh;padding:8px';
 frame.title='Graphical skill flow editor';frame.style.cssText='width:100%;height:calc(100% - 40px);border:0';
 const url=new URL('./index.html',source);url.hash=token;if(scope)url.searchParams.set('draft',scope);frame.src=url.href;
 function canClose(){
  if(active){close.textContent='Waiting for workflow request…';return false;}
  return !dirty||confirm(stored?'Close the editor? Unapplied fields are kept locally and restored when you reopen this session.':'Browser recovery is unavailable. Apply or copy your pending fields before closing. Close anyway?');
 }
 function cleanup(){if(removed)return;removed=true;window.removeEventListener('message',handle);dialog.remove();}
 function closeEditor(){dialog.close();cleanup();}
 close.textContent='Close flow editor';close.onclick=()=>{if(canClose())closeEditor();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(canClose())closeEditor();});
 dialog.append(close,frame);document.body.append(dialog);
 const reply=value=>{if(frame.isConnected&&frame.contentWindow)frame.contentWindow.postMessage({format:'suite-skill-flow/response-v1',token,...value},location.origin);};
 const handle=async event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.token!==token)return;
  const data=event.data;
  if(data.format==='suite-skill-flow/draft-state-v1'){if(typeof data.dirty==='boolean'&&typeof data.stored==='boolean'){dirty=data.dirty;stored=data.stored;}return;}
  if(data.format!=='suite-skill-flow/request-v1'||typeof data.id!=='string'||!data.id||data.id.length>100)return;
  let owned=false,timer,dispatched=false;
  try{
   if(active)throw Error('A flow library request is already in progress');
   if(!request||!scope||session?.()?.id!==scope)throw Error('Start or load an agent session, then reopen the flow editor');
   if(!canEdit())throw Error('Stop the current agent run before editing its workflow library');
   if(!['read','save'].includes(data.op))throw Error('Unsupported flow library operation');
   if(typeof data.workflowId!=='string'||!/^([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.test(data.workflowId))throw Error('Choose a workflow ID');
   if(data.op==='save'&&(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision<0||typeof data.enabled!=='boolean'))throw Error('Reload the editor: saves require a reviewed revision and explicit enabled status');
   active=true;owned=true;close.disabled=true;
   const controller=new AbortController(),operation={op:data.op==='read'?'workflow_read':'workflow_save',session:scope,id:data.workflowId,...(data.op==='save'?{definition:data.definition,expectedRevision:data.expectedRevision,enabled:data.enabled,reason:'Reviewed graphical skill flow',evidenceCallIds:[]}:{})};
   dispatched=true;const value=await Promise.race([request(operation,controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error(data.op==='save'?'Workflow save timed out. It may have completed; reload the library before retrying.':'Workflow load timed out. Your current draft is unchanged.'));controller.abort();},14000);})]);
   if(removed||session?.()?.id!==scope)throw Error('Agent session changed while the library request was in flight. Reopen the editor for the current session.');
   if(!canEdit())throw Error('The agent started during the library request. Stop it and reload the workflow.');
   reply({id:data.id,value});
  }catch(error){reply({id:data.id,error:error.message,rejected:!dispatched||error.rejected===true,uncertain:dispatched&&data.op==='save'&&error.rejected!==true});}
  finally{clearTimeout(timer);if(owned){active=false;close.disabled=false;close.textContent='Close flow editor';}}
 };
 window.addEventListener('message',handle);
 dialog.addEventListener('close',cleanup,{once:true});
 dialog.showModal();
}};
})();
