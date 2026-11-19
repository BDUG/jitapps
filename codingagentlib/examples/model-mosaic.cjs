/* Deterministic optional mosaic + project graph, no provider credentials. */
const {createAgent,createModelMosaic,ProjectGraphMemory}=require('../javascript');
(async()=>{
 const memory=new ProjectGraphMemory();await memory.refresh('flight',[{path:'control.py',content:'class FlightController:\n    pass\n'}]);
 const reply=request=>({sessionId:request.sessionId,step:request.step,status:'done',plan:'Inspect supplied project references',action:null,summary:'Project graph contains '+request.context[0].projectKnowledge.nodes.length+' reference entities.'});
 const model=createModelMosaic({models:{planner:reply,coder:reply,reviewer:reply},routes:{default:'coder',plan:'planner',review:'reviewer'},maxCalls:5});
 const agent=createAgent({model,contextProviders:[memory.contextProvider('flight',{query:'FlightController',hops:2})]});
 console.log(JSON.stringify({result:await agent.run('Inspect FlightController'),mosaic:model.inspect()},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
