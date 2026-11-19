/* Optional host-owned model routing. Exactly one provider call per turn. */
(function(root){'use strict';
function phase(request){
 if(request.step===1)return 'plan';
 const observation=[...(request.events||[])].reverse().find(e=>['observation','tool_result'].includes(e.kind))?.value;
 if(observation?.ok===true&&['run_command','run_script','read_command_output'].includes(observation.tool)&&observation.result?.exitCode===0)return 'review';
 return 'code';
}
function createModelMosaic({models,routes,select=phase,maxCalls=500,onEvent=()=>{}}={}){
 if(!models||typeof models!=='object'||!routes||typeof routes!=='object'||typeof select!=='function'||typeof onEvent!=='function'||!Number.isSafeInteger(maxCalls)||maxCalls<1)throw Error('Invalid model mosaic configuration');
 const providers=new Map(Object.entries(models));if(!providers.size||providers.size>16||[...providers].some(([id,fn])=>!id||typeof fn!=='function'))throw Error('Configure 1–16 host-owned models');
 const routing=new Map(Object.entries(routes));if(!routing.has('default')||[...routing.values()].some(id=>!providers.has(id)))throw Error('Mosaic routes must name configured models, including default');
 let calls=0;const history=[];
 const model=async(request,signal)=>{
  if(signal?.aborted)throw signal.reason||Error('Cancelled');
  if(calls>=maxCalls)throw Error('Mosaic model-call budget exhausted');
  const role=await select(JSON.parse(JSON.stringify(request))),id=routing.get(role)||routing.get('default');if(typeof role!=='string'||!role||role.length>80)throw Error('Mosaic selector must return a bounded role name');
  if(signal?.aborted)throw signal.reason||Error('Cancelled');
  if(calls>=maxCalls)throw Error('Mosaic model-call budget exhausted');
  const event={call:++calls,role,model:id,sessionId:request.sessionId,step:request.step};history.push(event);if(history.length>1000)history.shift();await onEvent({...event});
  // No fallback/replay: errors return to normal orchestration and cancellation.
  return providers.get(id)(request,signal);
 };
 model.inspect=()=>({format:'codingagentlib/model-mosaic-v1',calls,maxCalls,routes:Object.fromEntries(routing),history:history.map(e=>({...e}))});return model;
}
const api={createModelMosaic,mosaicPhase:phase};root.CodingAgentMosaic=api;if(typeof module==='object')module.exports=api;
})(typeof window==='object'?window:globalThis);
