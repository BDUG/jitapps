const {EmbeddedAgent}=require('../javascript/index.js');
const agent=new EmbeddedAgent({context:{application:'example'},onEvent:event=>console.log(event.kind)});
agent.addTool('greet',async(args,context)=>({message:'Hello '+args.name,callId:context.callId}),{description:'Greet a person; args:{name:string}'});
agent.run({goal:'Greet the developer',model:async request=>{const done=request.events.some(e=>e.kind==='observation');return {sessionId:request.sessionId,step:request.step,status:done?'done':'act',plan:'Use the host greeting tool',action:done?null:{tool:'greet',args:{name:'developer'}},summary:'Greeting observed'};}}).then(console.log).catch(error=>{console.error(error);process.exitCode=1;});
