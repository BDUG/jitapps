'use strict';
// Optional explicit transports. Commands are literal argv, never a shell string.
const {spawn}=require('node:child_process');
const {resolveExecutable}=require('./executable.js');
function jsonData(value) {
  if(value===null||typeof value==='string'||typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(Array.isArray(value))return value.every(jsonData);
  return !!value&&typeof value==='object'&&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(value).every(jsonData);
}
function frameKind(frame) {
  const own=key=>Object.hasOwn(frame,key),id=value=>value===null||typeof value==='string'||Number.isSafeInteger(value);
  if(!frame||typeof frame!=='object'||Array.isArray(frame)||frame.jsonrpc!=='2.0'||!jsonData(frame))throw Error('Invalid MCP JSON-RPC frame');
  if(own('method')) {
    if(typeof frame.method!=='string'||!frame.method||own('result')||own('error')||own('id')&&!id(frame.id)||own('params')&&(!frame.params||typeof frame.params!=='object'))throw Error('Invalid MCP JSON-RPC request');
    return own('id')?'request':'notification';
  }
  if(!own('id')||!id(frame.id)||own('result')===own('error')||own('params'))throw Error('Invalid MCP JSON-RPC response');
  if(own('error')&&(!frame.error||typeof frame.error!=='object'||Array.isArray(frame.error)||!Number.isSafeInteger(frame.error.code)||typeof frame.error.message!=='string'))throw Error('Invalid MCP JSON-RPC error');
  return 'response';
}
function rpcTransport(send) {
  if(typeof send!=='function')throw Error('Provide an RPC sender');let sequence=0;
  return {
    async notify(method,params={}){const frame={jsonrpc:'2.0',method,params};frameKind(frame);await send(frame);},
    async request(method,params={},options={}) {
      const id=++sequence,request={jsonrpc:'2.0',id,method,params};frameKind(request);const frame=await send(request,options);
      if(frame?.jsonrpc!=='2.0'||frame.id!==id)throw Error('RPC response identity mismatch');
      if(frameKind(frame)!=='response')throw Error('Expected an MCP JSON-RPC response');
      if(Object.hasOwn(frame,'error'))throw Error(frame.error.message||'RPC failed');return frame.result;
    }
  };
}
async function initialize(transport,{signal}={}) {
  const value=await transport.request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'codingagentlib',version:'1.0.0'}},{signal});
  if(value?.protocolVersion!=='2025-03-26')throw Error('MCP version mismatch');
  await transport.notify?.('notifications/initialized',{});return transport;
}
async function shellMcp({command,args=[],cwd,env=process.env,timeout=30000,signal}={}) {
  if(!Array.isArray(args)||args.some(v=>typeof v!=='string')||!Number.isSafeInteger(timeout)||timeout<1||timeout>600000)throw Error('Provide literal command args and a bounded timeout');
  if(signal?.aborted)throw Object.assign(Error('MCP startup cancelled'),{name:'AbortError'});
  const child=spawn(resolveExecutable(command,env),args,{cwd,env,stdio:['pipe','pipe','pipe'],shell:false});
  let sequence=0,buffer='',failure=null,closed=false;const pending=new Map();
  const fail=error=>{failure=error;for(const item of pending.values()){item.cleanup();item.reject(error);}pending.clear();};
  child.on('error',fail);child.on('exit',()=>{closed=true;fail(Error('MCP process exited; inspect uncertain calls before retrying'));});child.stdin.on('error',fail);child.stderr.on('data',()=>{});
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
    if(failure)return;buffer+=chunk;
    for(;;){const end=buffer.indexOf('\n');if(end<0)break;const text=buffer.slice(0,end);buffer=buffer.slice(end+1);
      try {
        if(Buffer.byteLength(text)>8000000)throw Error('MCP output exceeded 8 MB');
        const frame=JSON.parse(text),kind=frameKind(frame);if(kind==='notification')continue;
        if(kind==='request'){child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:frame.id,error:{code:-32601,message:'Client method not supported'}})+'\n');continue;}
        const item=pending.get(frame.id);if(!item)throw Error('RPC response identity mismatch');pending.delete(frame.id);item.cleanup();
        Object.hasOwn(frame,'error')?item.reject(Error(frame.error.message||'RPC failed')):item.resolve(frame.result);
      }catch(error){fail(Object.assign(error,{uncertain:true}));child.kill();return;}
    }
    if(Buffer.byteLength(buffer)>8000000){fail(Object.assign(Error('MCP output exceeded 8 MB'),{uncertain:true}));child.kill();}
  });
  const transport={
    notify(method,params={}) {if(failure||closed)throw failure||Error('MCP transport closed');const frame={jsonrpc:'2.0',method,params};frameKind(frame);child.stdin.write(JSON.stringify(frame)+'\n');},
    request(method,params={},{signal}={}) {
      if(failure||closed)return Promise.reject(failure||Error('MCP transport closed'));
      if(signal?.aborted)return Promise.reject(Object.assign(Error('MCP request cancelled'),{name:'AbortError'}));
      return new Promise((resolve,reject)=>{
        const id=++sequence,frame={jsonrpc:'2.0',id,method,params};frameKind(frame);const encoded=JSON.stringify(frame)+'\n';
        const abort=()=>{fail(Object.assign(Error('MCP request cancelled; outcome may be uncertain'),{uncertain:true}));child.kill();};
        const timer=setTimeout(()=>{fail(Object.assign(Error('MCP timeout; outcome may be uncertain'),{uncertain:true}));child.kill();},timeout);
        const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
        pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
        child.stdin.write(encoded,error=>{if(error){fail(Object.assign(error,{uncertain:true}));child.kill();}});
      });
    },
    async close() {
      if(closed)return;closed=true;fail(Object.assign(Error('MCP transport closed; inspect pending calls'),{uncertain:true}));child.stdin.end();child.kill();
      if(child.exitCode!==null)return;
      await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},2000);child.once('close',()=>{clearTimeout(timer);resolve();});});
    }
  };
  try{return await initialize(transport,{signal});}catch(error){await transport.close();throw error;}
}
module.exports={rpcTransport,shellMcp,initialize,frameKind};
