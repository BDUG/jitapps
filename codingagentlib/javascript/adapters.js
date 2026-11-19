'use strict';
const {createAgent}=require('./core.js');
function fromEmbedded(embedded,{model,...options}={}) {
  if(embedded.busy)throw Error('Embedded agent is busy');
  const extraPolicy=options.policy||{};
  return createAgent({...options,model,tools:[...embedded.tools.values()].map(({handler,...tool})=>({...tool,execute:(args,ctx)=>handler(args,{...ctx,context:ctx.context[0]}),available:(context,state)=>embedded.tools.get(tool.name)?.enabled===true&&embedded.toolAvailable(tool,context[0],state)})),contextProviders:[(state,signal)=>embedded.contextProvider?embedded.contextProvider(state,signal):embedded.context],policy:{...extraPolicy,authorize:async(action,state)=>await embedded.beforeTool({...embedded.tools.get(action.tool),handler:undefined},action.args)===true&&(!extraPolicy.authorize||await extraPolicy.authorize(action,state)===true),complete:async(response,state)=>await embedded.beforeFinish(response,state)===true&&(!extraPolicy.complete||await extraPolicy.complete(response,state)===true)},onEvent:embedded.onEvent});
}
module.exports={fromEmbedded};
