'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),core=require('./index.js'),{resolveExecutable}=require('./executable.js');
const SCRIPT_TOOL_NAMES=['list_scripts','write_script','read_script','delete_script','run_script','python_env','script_run','script_library','python_tools','python_tool_save','python_target_save'];
const PROGRAM_TOOL_NAMES=['run_command','read_command_output','run_script','script_run'];
const EDIT_TOOLS=new Set(['write_file','replace_text','apply_edits','apply_patch','delete_file','restore_file','write_script','delete_script','python_tool_save','python_target_save','skill_save','workflow_save']);
const COMMAND_TOOLS=new Set(['run_command','start_process','write_stdin','stop_process','run_script','script_run','workflow_run','workflow_continue']);

function schemaFromArguments(args){
 if(!args||typeof args!=='object')return {type:'object',properties:{}};
 const properties={};
 for(const [key,desc]of Object.entries(args)){
  if(desc&&typeof desc==='object'&&desc.type){properties[key]=JSON.parse(JSON.stringify(desc));continue;}
  const text=String(desc||''),low=text.toLowerCase();
  let prop;
  if(low.startsWith('array')||low.includes('array of'))prop={type:'array',items:{}};
  else if(low.startsWith('boolean')||low.startsWith('optional boolean'))prop={type:'boolean'};
  else if(low.startsWith('integer')||low.startsWith('optional integer')||low.startsWith('one-based integer'))prop={type:'integer'};
  else if(low.startsWith('json')||low.startsWith('optional {')||low.split(',')[0].includes('object'))prop={type:'object'};
  else prop={type:'string'};
  if(text)prop.description=text;
  properties[key]=prop;
 }
 return {type:'object',properties};
}

class LocalRuntime{
 constructor({workspace,commands=[],python='python3',pythonPath,env=process.env,exclusiveWorkspace=false,toolLibrary=null}={}){if(!workspace)throw Error('Provide a workspace directory.');const repo=path.resolve(__dirname,'../..');const variables={...env};pythonPath??=fs.existsSync(path.join(repo,'codingagentlib','__main__.py'))?repo:null;if(pythonPath)variables.PYTHONPATH=[pythonPath,variables.PYTHONPATH].filter(Boolean).join(path.delimiter);this.worker=spawn(resolveExecutable(python,variables),['-u','-m','codingagentlib','--workspace',path.resolve(workspace),...(exclusiveWorkspace?['--exclusive-workspace']:[]),...(toolLibrary?['--tool-library',path.resolve(toolLibrary)]:[]),...commands.flatMap(command=>['--allow-command',command])],{env:variables,stdio:['pipe','pipe','pipe']});this.sequence=0;this.pending=new Map();this.buffer='';this.stderr='';this.worker.stderr.on('data',data=>{this.stderr=(this.stderr+data).slice(-64000);});this.worker.stdout.setEncoding('utf8');this.worker.stdout.on('data',data=>{this.buffer+=data;for(;;){const i=this.buffer.indexOf('\n');if(i<0)break;const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);try{const response=JSON.parse(line);if(response.protocol!=='codingagentlib/1')throw Error('Invalid worker protocol');const pending=this.pending.get(response.id);if(!pending)continue;this.pending.delete(response.id);response.ok?pending.resolve(response.result):pending.reject(Object.assign(Error(response.error.message),{name:response.error.type}));}catch(error){this.fail(error);this.worker.kill();}}});this.worker.stdin.on('error',error=>this.fail(error));this.worker.on('error',error=>this.fail(error));this.worker.on('exit',()=>this.fail(Error('Coding-agent worker exited. '+this.stderr)));}
 fail(error){this.failure=error;for(const pending of this.pending.values())pending.reject(error);this.pending.clear();}
 call(method,params={}){if(this.failure)return Promise.reject(this.failure);const id=++this.sequence;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.stdin.write(JSON.stringify({protocol:'codingagentlib/1',id,method,params})+'\n',error=>{if(error){this.pending.delete(id);reject(error);}});});}
 dispatch(params){return this.call('dispatch',params);}
 pythonEnv(action='status',params={}){return this.dispatch({op:'python_env',action,...params});}
 scriptLibrary(action='list',params={}){return this.dispatch({op:'script_library',action,...params});}
 toolLibrary(action='list',params={}){return this.dispatch({op:'tool_library',action,...params});}
 agentMemory(action='stats',params={}){return this.dispatch({op:'agent_memory',action,...params});}
 memorySuite(action='stats',params={}){return this.dispatch({op:'memory_suite',action,...params});}
 async coreTools({sessionId=null,allowEdits=false,allowCommands=false,names=null,includeBrowser=false}={}){
  const health=await this.dispatch({op:'health'});
  const selected=names?new Set(names):null;
  let activeSession=sessionId,pendingSession=null;
  const ensureSession=async()=>{
   if(activeSession)return activeSession;
   if(!pendingSession){
    pendingSession=this.dispatch({op:'start',goal:'CoreAgent runtime tool session',tool:'sdk-core',allowEdits:!!allowEdits,allowCommands:!!allowCommands}).then(s=>{activeSession=s.id;return activeSession;});
   }
   return pendingSession;
  };
  const tools=[];
  for(const spec of health.tools||[]){
   if(!includeBrowser&&['read_current_project','apply_project'].includes(spec.name))continue;
   if(selected&&!selected.has(spec.name))continue;
   const permission=COMMAND_TOOLS.has(spec.name)?'commands':EDIT_TOOLS.has(spec.name)?'edits':'read';
   tools.push({
    name:spec.name,
    version:1,
    description:spec.description||'',
    parameters:spec.parameters?JSON.parse(JSON.stringify(spec.parameters)):schemaFromArguments(spec.arguments),
    permission,
    execute:async(args,context)=>{
     const sid=await ensureSession();
     const callId=String(context?.callId||('core_'+spec.name));
     const obs=await this.dispatch({op:'tool',session:sid,tool:spec.name,args:args||{},callId});
     if(!obs.ok)throw Error(obs.error||(spec.name+' failed'));
     return obs.result;
    },
   });
  }
  return tools;
 }
 scriptTools(options={}){return this.coreTools({...options,names:SCRIPT_TOOL_NAMES});}
 programTools(options={}){return this.coreTools({...options,names:PROGRAM_TOOL_NAMES});}
 async close(){if(!this.failure)try{await this.call('close');}finally{this.worker.stdin.end();}else this.worker.kill();}
 async run({goal,model,project=null,sessionId=null,allowEdits=false,allowCommands=false,rememberSessions=true,decisionModel=null,decisionMode='auto',acceptanceRules=[],onTrace=()=>{},onUpdate=()=>{},onPause,signal,batch=500,review=null,toolDiscovery=false}={}){if(typeof model!=='function')throw Error('Provide an async model(request, signal) callback.');const health=await this.dispatch({op:'health'}),session=await this.dispatch(sessionId?{op:'resume',session:sessionId}:{op:'start',goal,tool:'headless',knowledgeProject:project,allowEdits,allowCommands,rememberSessions,acceptanceRules,independentReview:!!review});const id=session.id;const api=data=>this.dispatch({...data,session:id});if(goal&&goal!==session.goal)await api({op:'event',value:{status:'follow_up',text:goal}});const state={id,goal:session.goal,workspace:session.workspace,events:session.events,tools:health.tools.filter(t=>!['read_current_project','apply_project'].includes(t.name)&&!t.name.startsWith('catalog_')),permissions:{allowEdits:session.allowEdits,allowCommands:session.allowCommands,applyProject:false}};const abort=()=>this.worker.kill('SIGTERM');if(signal?.aborted){await api({op:'cancel'});throw new DOMException('Agent stopped.','AbortError');}signal?.addEventListener('abort',abort,{once:true});try{const result=await core.loop.run(state,{model,decisionModel,decisionMode,signal,batch,toolDiscovery,onTrace,onUpdate,sync:()=>api({op:'events',after:-1}),reserveTurn:async({userRevision})=>{return await api({op:'turn',expectedUserRevision:userRevision});},record:value=>api({op:'event',value}),feedback:value=>api({op:'feedback',...value}),act:(action,{callId,userRevision})=>api({op:'tool',tool:action.tool,args:action.args,callId,expectedUserRevision:userRevision,...(action.checks?{checks:action.checks}:{}),...(action.taskId?{taskId:action.taskId}:{})}),recover:async(action,{callId})=>{const value=await api({op:'tool_status',callId});if(value.state==='complete')return value.observation;throw Error('Tool outcome is not resolved; inspect tool_status and workspace changes before retrying.');},finish:(value,{userRevision})=>api({op:'finish',summary:value.summary,outcome:value.outcome||'complete',verification:value.verification||[],expectedUserRevision:userRevision}),review:review?candidate=>core.independentReview.run({candidate,api,model:review,signal}):null,onPause:async info=>{if(onPause)return onPause(info);throw Object.assign(Error('Agent step budget reached'),{name:'AgentPaused',reason:info.reason});}});if(result.status!=='complete')await api({op:'cancel'});return {...result,sessionId:id};}catch(error){if(!this.failure)await api({op:'cancel'}).catch(()=>{});if(error.name==='AgentPaused')return {status:'paused',reason:error.reason,sessionId:id,state};throw error;}finally{signal?.removeEventListener('abort',abort);}}
}
module.exports={LocalRuntime,SCRIPT_TOOL_NAMES,PROGRAM_TOOL_NAMES};
