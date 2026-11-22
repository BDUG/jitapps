'use strict';
const readline=require('node:readline');
const {EmbeddedAgent}=require('../../javascript/embedded');
async function run(data){
 const state=data.state,trace=[];
 const agent=new EmbeddedAgent({context:state,onEvent:event=>trace.push(event)});
 agent.addTool('svg_color',args=>{if(!['red','blue','green','purple'].includes(args.value))throw Error('Choose red, blue, green or purple');state.color=args.value;return {...state};},{description:'Change SVG circle color',permission:'edits'});
 agent.addTool('rich_text',args=>{if(typeof args.value!=='string'||args.value.length>2000)throw Error('Text must contain at most 2000 characters');state.text=args.value;return {...state};},{description:'Replace rich text paragraph (plain text)',permission:'edits'});
 const model=async request=>{
  trace.push({kind:'model_request',value:structuredClone(request)});
  if(process.argv.includes('--model-bridge')){console.log(JSON.stringify({modelRequest:request}));const response=JSON.parse((await lines.next()).value);trace.push({kind:'model_response',value:structuredClone(response)});return response;}
  const observed=request.events.some(e=>e.kind==='observation');
  const match=/^(svg_color|rich_text) (.+)$/s.exec(request.goal);
  const response={sessionId:request.sessionId,step:request.step,plan:'Use the selected view tool and inspect its observation',status:observed?'done':match?'act':'ask',action:null};
  if(observed)response.summary='Tool finished; inspect the observation for success or failure.';
  else if(match)response.action={tool:match[1],args:{value:match[2]}};
  else response.question='Try svg_color purple or rich_text Hello world';
  trace.push({kind:'model_response',value:response});return response;
 };
 return {state,trace,result:await agent.run({goal:data.goal,model,allowEdits:true,maxSteps:3})};
}
const reader=readline.createInterface({input:process.stdin,terminal:false});
const lines=reader[Symbol.asyncIterator]();
(async()=>{const data=JSON.parse((await lines.next()).value);console.log(JSON.stringify(await run(data)));})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>reader.close());
