'use strict';
const {createAgent} = require('./core.js');
const {checkSchema,validate} = require('./contracts.js');
const copy=value=>JSON.parse(JSON.stringify(value));

// Transport is supplied by an MCP SDK client: no implicit server trust or network.
async function mcpTools({transport,trust,names}={}) {
  if(typeof transport?.request!=='function'||typeof trust!=='function')throw Error('Provide an MCP transport and explicit trust callback');
  const listing=await transport.request('tools/list',{});
  if(!Array.isArray(listing?.tools)||listing.nextCursor)throw Error('Provide one complete, bounded MCP tool page');
  const result=[];
  for(const definition of listing.tools) {
    const tool=copy(definition);
    if(names&&!names.includes(tool.name))continue;
    if(await trust(copy(tool))!==true)continue;
    checkSchema(tool.inputSchema);
    result.push({name:tool.name,version:1,description:tool.description||'',parameters:copy(tool.inputSchema),permission:'commands',execute:async(args,context)=> {
      validate(tool.inputSchema,args);
      if(await trust(copy(tool),context)!==true)throw Error('MCP trust revoked');
      let reply;try{reply=await transport.request('tools/call',{name:tool.name,arguments:args},{signal:context.signal});}catch(e){e.uncertain=true;throw e;}
      if(!reply||typeof reply!=='object'||!Array.isArray(reply.content)||reply.isError!==undefined&&typeof reply.isError!=='boolean')throw Object.assign(Error('Invalid MCP tool result; outcome may be uncertain'),{uncertain:true});
      if(reply?.isError)throw Error('MCP tool failed: '+JSON.stringify(reply.content));
      return reply;
    }});
  }
  return result;
}

function exposeMcp({tools,authorize}={}) {
  if(!Array.isArray(tools)||typeof authorize!=='function')throw Error('Explicit MCP authorization is required');
  const registry=new Map();
  for(const tool of tools) {checkSchema(tool.parameters);if(registry.has(tool.name)||typeof tool.execute!=='function')throw Error('Invalid MCP tool');registry.set(tool.name,tool);}
  return async(method,params={},context={})=> {
    if(method==='tools/list')return {tools:[...registry.values()].map(t=>({name:t.name,description:t.description,inputSchema:t.parameters}))};
    if(method!=='tools/call'||!registry.has(params.name))throw Error('Unsupported MCP method or tool');
    const tool=registry.get(params.name);validate(tool.parameters,params.arguments);
    if(await authorize(params.name,params.arguments,context)!==true)throw Error('MCP action denied');
    try {const value=await tool.execute(params.arguments,context);return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:{result:value},isError:false};}
    catch(e){return {content:[{type:'text',text:e.message}],isError:true};}
  };
}

function delegationTool({name='delegate',model,tools=[],contextProviders=[],policy={},budgets={},maxDepth=1}={}) {
  if(!Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>8)throw Error('Delegation depth must be 1..8');
  if(tools.some(t=>t.permission!=='read'))throw Error('Delegated tools must be explicitly read-only');
  return {name,version:1,description:'Run a bounded read-only child agent; results are observations, not proof of completion.',permission:'read',parameters:{type:'object',required:['goal'],properties:{goal:{type:'string',minLength:1}},additionalProperties:false},execute:async(args,parent)=> {
    const depth=(parent.delegationDepth??0)+1;
    if(depth>maxDepth)throw Error('Delegation depth exhausted');
    const scopedTools=tools.map(tool=>({...tool,execute:(input,ctx)=>tool.execute(input,{...ctx,delegationDepth:depth})}));
    const child=createAgent({model,tools:scopedTools,contextProviders,policy,budgets:{modelCalls:16,toolCalls:16,elapsedMs:60000,sessionBytes:1000000,...budgets},tenant:parent.sessionId});
    const result=await child.run(args.goal,{signal:parent.signal});
    return {format:'codingagentlib/delegation-v1',parentCallId:parent.callId,childSessionId:result.sessionId,depth,result,events:child.snapshot().events};
  }};
}
const capabilities=()=>({protocol:'codingagentlib/sdk-v1',features:['mcp-transport','mcp-rpc','mcp-shell','delegation'],requiresExplicitTrust:true});
module.exports={mcpTools,exposeMcp,delegationTool,capabilities};
