'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const IGNORED=new Set(['.git','.codingagentlib-rust','.suite-agent','.suite-wormhole','node_modules','target','dist','build','.venv','venv','__pycache__']);
const MAX_FILE_BYTES=10_000_000;

function snapshotsRoot(workspaceRoot){return path.join(workspaceRoot,'.codingagentlib-rust','snapshots');}

function safeId(id){
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(id))throw Error('Invalid snapshot ID');
 return id;
}

function safeRelative(root,rel){
 if(typeof rel!=='string'||!rel||rel.includes('\0')||rel.includes('\\')||path.isAbsolute(rel))throw Error('Invalid snapshot file path');
 const parts=rel.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||IGNORED.has(p)))throw Error('Invalid snapshot file path');
 const target=path.resolve(root,rel),check=path.relative(root,target);
 if(!check||check.startsWith('..')||path.isAbsolute(check))throw Error('Snapshot path escapes workspace');
 return target;
}

async function collectFiles(root,dir=root,prefix='',out=[]){
 const entries=await fs.readdir(dir,{withFileTypes:true});
 entries.sort((a,b)=>a.name.localeCompare(b.name));
 for(const entry of entries){
  if(entry.isSymbolicLink()||IGNORED.has(entry.name))continue;
  const rel=prefix?prefix+'/'+entry.name:entry.name,full=path.join(dir,entry.name);
  if(entry.isDirectory()){await collectFiles(root,full,rel,out);continue;}
  if(!entry.isFile())continue;
  const stat=await fs.stat(full);
  if(stat.size>MAX_FILE_BYTES)continue;
  out.push(rel);
 }
 return out;
}

async function createSnapshot(workspaceRoot,{label='Snapshot',sessionId=''}={}){
 const id=Date.now().toString(36)+'-'+crypto.randomBytes(4).toString('hex');
 const dir=path.join(snapshotsRoot(workspaceRoot),id),filesDir=path.join(dir,'files');
 await fs.mkdir(filesDir,{recursive:true});
 const rels=await collectFiles(workspaceRoot),files=[];
 for(const rel of rels){
  const src=path.join(workspaceRoot,rel),bytes=await fs.readFile(src);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const dest=path.join(filesDir,rel);
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.writeFile(dest,bytes);
  files.push({path:rel,sha256,size:bytes.length});
 }
 const manifest={id,label:String(label||'Snapshot').slice(0,120),sessionId:String(sessionId||''),createdAt:new Date().toISOString(),fileCount:files.length,files};
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),'utf8');
 return manifest;
}

async function listSnapshots(workspaceRoot){
 const root=snapshotsRoot(workspaceRoot);
 let entries;
 try{entries=await fs.readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const items=[];
 for(const entry of entries){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;
  try{
   const raw=await fs.readFile(path.join(root,entry.name,'manifest.json'),'utf8');
   const m=JSON.parse(raw);
   if(m&&typeof m.id==='string'&&Array.isArray(m.files))items.push({id:m.id,label:m.label||'Snapshot',sessionId:m.sessionId||'',createdAt:m.createdAt||'',fileCount:m.files.length});
  }catch{}
 }
 items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 return items;
}

async function restoreSnapshot(workspaceRoot,id){
 const validId=safeId(id),dir=path.join(snapshotsRoot(workspaceRoot),validId),filesDir=path.join(dir,'files');
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 if(!Array.isArray(manifest?.files))throw Error('Corrupt snapshot manifest');
 const expected=new Set(manifest.files.map(f=>f.path));
 // Verify all snapshot blobs before mutating the workspace.
 const payloads=[];
 for(const f of manifest.files){
  const dest=safeRelative(workspaceRoot,f.path),src=safeRelative(filesDir,f.path);
  const bytes=await fs.readFile(src);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Snapshot integrity check failed for '+f.path);
  payloads.push({dest,bytes});
 }
 const current=await collectFiles(workspaceRoot);
 for(const rel of current){
  if(!expected.has(rel))await fs.rm(safeRelative(workspaceRoot,rel),{force:true});
 }
 for(const {dest,bytes}of payloads){
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.writeFile(dest,bytes);
 }
 return manifest;
}

async function deleteSnapshot(workspaceRoot,id){
 const validId=safeId(id);
 await fs.rm(path.join(snapshotsRoot(workspaceRoot),validId),{recursive:true,force:true});
}

module.exports={createSnapshot,listSnapshots,restoreSnapshot,deleteSnapshot};
