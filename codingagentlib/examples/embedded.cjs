const {createAgent}=require('../javascript');
const agent=createAgent({
  tools:[{name:'greet',version:1,description:'Greet a person',permission:'read',parameters:{type:'object',required:['name'],properties:{name:{type:'string'}},additionalProperties:false},execute:(args,ctx)=>({message:'Hello '+args.name,callId:ctx.callId})}],
  model:request=>{const done=request.events.some(e=>e.kind==='tool_result');return {sessionId:request.sessionId,step:request.step,status:done?'done':'act',plan:'Use the registered greeting tool',action:done?null:{tool:'greet',args:{name:'developer'}},summary:'Greeting observed'};},
  onEvent:event=>console.log(event.kind)
});
agent.run('Greet the developer').then(console.log).catch(error=>{console.error(error);process.exitCode=1;});
