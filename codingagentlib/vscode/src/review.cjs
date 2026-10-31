'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),References=require('./attachments.cjs');
const MAX=8_000_000;
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
async function text(file){const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX)throw Error('Comparison requires UTF-8 files under 8 MB');const bytes=await fs.readFile(file);if(bytes.length>MAX||bytes.includes(0))throw Error('Comparison requires UTF-8 text files under 8 MB');try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),hash:hash(bytes)};}catch{throw Error('Comparison requires UTF-8 text files');}}
async function capture(workspace,sessionId,relative,manifest={}){
 if(typeof sessionId!=='string'||!/^[a-f0-9]{32}$/i.test(sessionId))throw Error('Invalid review session');
 const lexical=path.resolve(workspace),root=await fs.realpath(workspace),target=path.resolve(lexical,relative);References.relative(lexical,target);if(typeof relative!=='string'||relative!==References.relative(lexical,target))throw Error('Invalid review file path');
 let current=null;try{const actual=await fs.realpath(target);References.relative(root,actual);current=await text(actual);}catch(error){if(error.code!=='ENOENT')throw error;}
 const base=path.join(root,'.codingagentlib-rust',sessionId+'-backups'),key=hash(Buffer.from(relative)),record=path.join(base,key+'.json');let before=null,reason='',recordFound=false;const existed=Object.prototype.hasOwnProperty.call(manifest,relative);
 try{
  // Reject recovery symlinks rather than reading arbitrary files through private state.
  for(const entry of [path.join(root,'.codingagentlib-rust'),base,record])if((await fs.lstat(entry)).isSymbolicLink())throw Error('Recovery metadata uses a symlink');
  recordFound=true;const stat=await fs.stat(record);if(stat.size>16384)throw Error('Recovery metadata exceeds the review budget');const metadata=JSON.parse(await fs.readFile(record,'utf8'));
  if(metadata.path!==relative||typeof metadata.existed!=='boolean')throw Error('Recovery metadata does not match this file');
  if(existed&&!metadata.existed)throw Error('Recovery metadata conflicts with the initial manifest');
  if(metadata.existed){const original=path.join(base,key);if((await fs.lstat(original)).isSymbolicLink())throw Error('Recovery content uses a symlink');before=await text(original);if(typeof metadata.sha256!=='string'||before.hash!==metadata.sha256||(existed&&manifest[relative]!==metadata.sha256))throw Error('Recovery content hash does not match its metadata');}
  else before={text:'',hash:null};
 }catch(error){before=null;reason=error.code==='ENOENT'?'No file-tool before-image is available.':'Recovery data could not be verified: '+error.message;}
 if(!before&&!existed&&!recordFound&&reason==='No file-tool before-image is available.')before={text:'',hash:null};
 if(!current&&before&&!before.hash)return {beforeAvailable:false,current:null,reason:'This path has no current file or retained original content.',path:relative};
 if(!before)return {beforeAvailable:false,current:current?.text??null,reason,path:relative};
 return {beforeAvailable:true,before:before.text,current:current?.text??'',beforeHash:before.hash,currentHash:current?.hash??null,path:relative,status:!current?'deleted':!before.hash?'added':'modified',note:'Captured disk text at review time; not unsaved editor buffers or an atomic workspace snapshot.'};
}
module.exports={capture};
