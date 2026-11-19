'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {frameKind,rpcTransport,shellMcp}=require('./mcp-transports');
const peer=path.resolve(__dirname,'../conformance/fixtures/mcp_server.py');
(async()=>{
 for(const test of require('../conformance/mcp-frames-v1.json').cases){
  if(test.valid)assert.equal(frameKind(test.frame),test.kind,test.name);
  else assert.throws(()=>frameKind(test.frame),undefined,test.name);
 }
 for(const frame of [{jsonrpc:'2.0',id:1},{jsonrpc:'2.0',id:1,method:'roots/list'},{jsonrpc:'2.0',id:1,error:null}])await assert.rejects(rpcTransport(()=>frame).request('ping',{}));
 assert.equal(await rpcTransport(()=>({jsonrpc:'2.0',id:1,result:null})).request('ping',{}),null);
 for(const result of [undefined,NaN,Infinity,()=>{},new Date()])await assert.rejects(rpcTransport(()=>({jsonrpc:'2.0',id:1,result})).request('ping',{}));
 const {mcpTools}=require('./extensions');
 for(const test of require('../conformance/mcp-frames-v1.json').toolResults){
  const [tool]=await mcpTools({transport:{request:async method=>method==='tools/list'?{tools:[{name:'echo',inputSchema:{type:'object'}}]}:test.result},trust:()=>true});
  if(test.valid)assert.deepEqual(await tool.execute({},{}),test.result,test.name);
  else await assert.rejects(tool.execute({},{}),error=>error.uncertain===true,test.name);
 }
 const definition={name:'pinned',inputSchema:{type:'object',required:['path'],properties:{path:{type:'string'}}}},original=structuredClone(definition),calls=[];let trusted=true;
 const [pinned]=await mcpTools({transport:{request:async(method,params)=>{if(method==='tools/list')return {tools:[definition]};calls.push(params);return {content:[]};}},trust:tool=>{tool.name='mutated';tool.inputSchema={type:'object'};return trusted;}});
 assert.deepEqual(definition,original);definition.name='replaced';definition.inputSchema={type:'object'};pinned.parameters.properties.path.type='number';
 await assert.rejects(pinned.execute({path:123},{}));await pinned.execute({path:'README.md'},{});assert.equal(calls[0].name,'pinned');assert.equal(calls.length,1);trusted=false;await assert.rejects(pinned.execute({path:'README.md'},{}),/trust revoked/);assert.equal(calls.length,1);
 let transport=await shellMcp({command:'python3',args:[peer],timeout:2000});
 try{assert.deepEqual(await transport.request('tools/list',{}),{tools:[]});assert.deepEqual(await transport.request('ping',{}),{alive:true});}finally{await transport.close();}
 for(const mode of ['missing-result','both-results','wrong-id','invalid-notification','invalid-error','unicode-overflow']){
  transport=await shellMcp({command:'python3',args:[peer,mode],timeout:2000});
  try{await assert.rejects(transport.request('tools/list',{}),error=>error.uncertain===true);await assert.rejects(transport.request('ping',{}));}finally{await transport.close();}
 }
 transport=await shellMcp({command:'python3',args:[peer,'tool-error'],timeout:2000});
 try{await assert.rejects(transport.request('tools/list',{}),/Rejected arguments/);assert.deepEqual(await transport.request('ping',{}),{alive:true});}finally{await transport.close();}
 transport=await shellMcp({command:'python3',args:[peer,'reverse'],timeout:2000});
 try{assert.deepEqual(await Promise.all([transport.request('tools/list',{}),transport.request('ping',{})]),[{tools:[]},{alive:true}]);}finally{await transport.close();}
 transport=await shellMcp({command:'python3',args:[peer,'numeric-id'],timeout:2000});
 try{assert.deepEqual(await transport.request('tools/list',{}),{tools:[]});}finally{await transport.close();}
 transport=await shellMcp({command:'python3',args:[peer,'notification-timeout'],timeout:300});
 try{const start=Date.now();await assert.rejects(transport.request('tools/list',{}),/timeout/);assert.ok(Date.now()-start<2000);}finally{await transport.close();}
 console.log('PASS cross-language MCP frame conformance, notification interleaving, unsupported client requests, malformed/oversized reply closure, recoverable RPC errors, concurrent identities and notification deadlines.');
})().catch(error=>{console.error(error);process.exitCode=1;});
