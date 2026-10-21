/* Transport-independent agent loop: model plans never invoke tools without validation. */
(function(root){'use strict';
function stopped(signal){if(signal?.aborted)throw new DOMException('Agent stopped.','AbortError');}
function parse(text){const raw=text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1');const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected an agent response object.');return value;}
function validate(value,sessionId,step,tools){if(value.sessionId!==sessionId||value.step!==step)throw Error('Agent session/step identifiers do not match.');if(!['act','ask','done'].includes(value.status)||typeof value.plan!=='string')throw Error('Provide a status and concise public plan.');if(value.status==='act'){if(!value.action||!tools.some(t=>t.name===value.action.tool)||!value.action.args||typeof value.action.args!=='object'||Array.isArray(value.action.args))throw Error('Choose one available tool with an argument object.');}else if(value.action!==null)throw Error('Questions/completion must not contain an executable action.');if(value.status==='ask'&&(!value.question||typeof value.question!=='string'))throw Error('Provide a focused question.');if(value.status==='done'&&typeof value.summary!=='string')throw Error('Completion needs a summary.');return {sessionId,step,status:value.status,plan:value.plan,action:value.action,question:typeof value.question==='string'?value.question:undefined,summary:typeof value.summary==='string'?value.summary:undefined,verification:Array.isArray(value.verification)?value.verification.filter(v=>typeof v==='string'):[]};}
async function run(state,{model,act,record,finish,onUpdate=()=>{},onPause=async()=>{},signal,batch=8}){
 const spec=root.SuiteCodingAgentSpec;let steps=0,invalid=0;state.step=state.step||0;state.events=state.events||[];
 for(;;){stopped(signal);if(batch&&steps&&steps%batch===0){onUpdate({kind:'pause',message:'Step budget reached. Review observations, then continue or stop.'});await onPause();stopped(signal);}const step=++state.step;steps++;onUpdate({kind:'sense',step,message:'Inspecting observations and planning step '+step});
  const request={protocol:spec.protocol,sessionId:state.id,step,goal:state.goal,workspace:state.workspace,permissions:state.permissions,tools:state.tools,events:state.events,appContext:state.context||null,responseSchema:spec.responseSchema};
  let value;
  try{value=validate(parse(await model(request,signal)),state.id,step,state.tools);invalid=0;}catch(error){stopped(signal);if(error.name==='AbortError')throw error;if(++invalid>=3)throw Error('Agent returned three invalid plans: '+error.message);const event={kind:'protocol_error',value:{step,error:error.message}};state.events.push(event);onUpdate(event);continue;}
  stopped(signal);const event={kind:'assistant',value};await record(value);state.events.push(event);onUpdate(event);
  if(value.status==='ask'){state.status='waiting';return {status:'waiting',question:value.question,state};}
  if(value.status==='done'){await finish(value);state.status='complete';return {status:'complete',summary:value.summary,verification:value.verification||[],state};}
  onUpdate({kind:'action',step,action:value.action});const observation=await act(value.action,{callId:state.id+'_'+step,signal});stopped(signal);state.events.push({kind:'observation',value:{id:state.id+'_'+step,tool:value.action.tool,...observation}});onUpdate({kind:'observation',step,...observation});
 }
}
root.SuiteCodingAgentLoop={run,parse,validate};if(typeof module!=='undefined')module.exports=root.SuiteCodingAgentLoop;
})(typeof window==='undefined'?globalThis:window);
