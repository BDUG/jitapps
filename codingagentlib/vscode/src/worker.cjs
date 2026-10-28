'use strict';
const {spawn}=require('node:child_process'),readline=require('node:readline');
class Worker {
 constructor(binary,workspace,commands=[]){this.serial=0;this.pending=new Map();this.closed=false;this.stderr='';const args=['--workspace',workspace];for(const command of commands)args.push('--allow-command',command);this.child=spawn(binary,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});this.child.stderr.on('data',d=>this.stderr=(this.stderr+d).slice(-4000));this.child.stdin.on('error',e=>this.fail(e));this.lines=readline.createInterface({input:this.child.stdout});this.lines.on('line',line=>{try{const frame=JSON.parse(line);if(frame.protocol!=='codingagentlib/1')throw Error('Native worker protocol mismatch');const entry=this.pending.get(frame.id);if(!entry)throw Error('Unexpected native worker response');this.pending.delete(frame.id);frame.ok?entry.resolve(frame.result):entry.reject(Error(frame.error?.message||'Native operation failed'));}catch(e){this.fail(e);}});this.child.on('error',e=>this.fail(e));this.child.on('exit',(code)=>{this.closed=true;this.fail(Error('Native worker exited ('+code+'). '+this.stderr+' Inspect the saved session before retrying an uncertain action.'));});}
 fail(error){for(const entry of this.pending.values())entry.reject(error);this.pending.clear();}
 call(method,params={}){if(this.closed)return Promise.reject(Error('Native worker is closed'));const id=++this.serial;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.child.stdin.write(JSON.stringify({protocol:'codingagentlib/1',id,method,params})+'\n',error=>{if(error){this.pending.delete(id);reject(error);}});});}
 dispatch(params){return this.call('dispatch',params);}
 interrupt(){return this.call('interrupt').catch(()=>{});}
 close(){if(this.closing)return this.closing;this.closing=this._close();return this.closing;}
 async _close(){if(this.closed)return;await this.interrupt();const timeout=setTimeout(()=>this.child.kill(),2500);timeout.unref();try{await this.call('close');this.child.stdin.end();}finally{this.closed=true;clearTimeout(timeout);if(this.child.exitCode===null){const kill=setTimeout(()=>this.child.kill(),1000);kill.unref();}}}
}
module.exports={Worker};
