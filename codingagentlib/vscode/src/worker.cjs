'use strict';
const {spawn}=require('node:child_process'),readline=require('node:readline'),{resolveExecutable}=require('./executable.cjs');
class Worker {
 constructor(binary,workspace,commands=[],options={}){
  this.serial=0;this.pending=new Map();this.closed=false;this.stderr='';
  this.controlTimeout=options.controlTimeoutMs??2500;this.healthTimeout=options.healthTimeoutMs??10000;
  for(const timeout of [this.controlTimeout,this.healthTimeout])if(!Number.isInteger(timeout)||timeout<1||timeout>60000)throw Error('Worker control timeouts must be 1–60000 ms');
  const args=['--workspace',workspace];for(const command of commands)args.push('--allow-command',command);
  this.child=spawn(resolveExecutable(binary),args,{cwd:workspace,stdio:['pipe','pipe','pipe'],windowsHide:true});
  this.child.stderr.on('data',d=>this.stderr=(this.stderr+d).slice(-4000));
  this.child.stdin.on('error',e=>this.fail(e));
  this.lines=readline.createInterface({input:this.child.stdout});
  this.lines.on('line',line=>{
   try{
    const frame=JSON.parse(line);
    if(!frame||frame.protocol!=='codingagentlib/1'||typeof frame.ok!=='boolean')throw Error('Native worker protocol mismatch');
    const entry=this.pending.get(frame.id);if(!entry)throw Error('Unexpected native worker response');
    this.pending.delete(frame.id);clearTimeout(entry.timer);
    frame.ok?entry.resolve(frame.result):entry.reject(Error(frame.error?.message||'Native operation failed'));
   }catch(e){this.fail(e);}
  });
  this.child.on('error',e=>this.fail(e));
  this.child.on('exit',code=>{clearTimeout(this.killTimer);this.closed=true;this.fail(Error('Native worker exited ('+code+'). '+this.stderr+' Inspect the saved session before retrying an uncertain action.'));});
 }
 fail(error){
  if(!this.failure)this.failure=error;
  for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(this.failure);}
  this.pending.clear();
  // A broken stream cannot safely correlate later responses with new actions.
  if(!this.closed)this.terminate();
 }
 terminate(){if(this.child.exitCode!==null||this.child.signalCode!==null)return;this.child.kill();if(!this.killTimer){this.killTimer=setTimeout(()=>{if(this.child.exitCode===null)this.child.kill('SIGKILL');},250);this.killTimer.unref();}}
 call(method,params={},options={}){
  if(this.failure)return Promise.reject(this.failure);
  if(this.closed)return Promise.reject(Error('Native worker is closed'));
  const timeout=options.timeoutMs??(method==='dispatch'&&params.op==='health'?this.healthTimeout:0),id=++this.serial;
  return new Promise((resolve,reject)=>{
   const entry={resolve,reject,timer:null};this.pending.set(id,entry);
   if(timeout)entry.timer=setTimeout(()=>{
    const error=Error('Native worker did not answer '+method+' within '+timeout+' ms. Inspect the saved session before retrying; pending actions may already have changed files. No action was replayed.');error.code='native_worker_timeout';this.fail(error);
   },timeout);
   try{this.child.stdin.write(JSON.stringify({protocol:'codingagentlib/1',id,method,params})+'\n',error=>{if(error)this.fail(error);});}catch(error){this.fail(error);}
  });
 }
 dispatch(params){return this.call('dispatch',params);}
 interrupt(){return this.call('interrupt',{}, {timeoutMs:this.controlTimeout}).catch(()=>{});}
 close(){if(!this.closing)this.closing=this._close();return this.closing;}
 async _close(){
  if(this.closed)return;
  // Start the deadline before interrupt: an unresponsive worker may never acknowledge it.
  let timer;
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>{const error=Error('Native worker shutdown timed out. Review the saved session before resuming; no action was replayed.');error.code='native_worker_timeout';this.fail(error);resolve();},this.controlTimeout);});
  try{
   await Promise.race([deadline,(async()=>{if(this.failure)return;await this.interrupt();if(this.failure)return;await this.call('close',{}, {timeoutMs:this.controlTimeout});this.child.stdin.end();})()]);
  }catch(error){this.fail(error);}finally{
   clearTimeout(timer);this.closed=true;
   if(this.child.exitCode===null)this.terminate();
  }
 }
}
module.exports={Worker};
