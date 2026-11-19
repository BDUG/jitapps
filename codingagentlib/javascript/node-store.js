'use strict';
// Optional Node-only store. The portable core never imports this module.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
class DirectorySessionStore {
  constructor(root){this.root=path.resolve(root);this.owners=new Map();}
  key(tenant,id){return crypto.createHash('sha256').update(JSON.stringify([tenant,id])).digest('hex');}
  async directory(){await fs.mkdir(this.root,{recursive:true,mode:0o700});const stat=await fs.lstat(this.root);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Session root must be a real private directory');if(process.platform!=='win32'&&(stat.mode&0o077))throw Error('Session directory must have mode 0700');}
  async acquire(tenant,id,owner){await this.directory();const key=this.key(tenant,id),file=path.join(this.root,key+'.lock');let handle;try{handle=await fs.open(file,'wx',0o600);}catch(e){if(e.code==='EEXIST')return false;throw e;}try{await handle.writeFile(owner);await handle.sync();}finally{await handle.close();}this.owners.set(key,owner);return true;}
  async release(tenant,id,owner){const key=this.key(tenant,id);if(this.owners.get(key)!==owner)return;const file=path.join(this.root,key+'.lock');if(await fs.readFile(file,'utf8')!==owner)throw Error('Lease owner changed');await fs.unlink(file);this.owners.delete(key);}
  async load(tenant,id){await this.directory();const file=path.join(this.root,this.key(tenant,id)+'.json');try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||process.platform!=='win32'&&(stat.mode&0o077))throw Error('Unsafe session file');return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async save(tenant,id,state,revision){const key=this.key(tenant,id);if(!this.owners.has(key))throw Error('Save requires a session lease');const previous=await this.load(tenant,id);if((previous?.revision??0)!==revision)throw Error('Session revision conflict');const file=path.join(this.root,key+'.json'),temporary=file+'.'+crypto.randomUUID()+'.tmp';const handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify({...state,revision:revision+1}));await handle.sync();await handle.close();await fs.rename(temporary,file);return revision+1;}catch(e){await handle.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});throw e;}}
}
module.exports={DirectorySessionStore};
