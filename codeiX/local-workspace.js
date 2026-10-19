/* Browser-granted local directory access; no server filesystem exposure. */
'use strict';
(()=>{
let directory=null, originals=new Map(), savedSignature='', busy=false;
const ignored=new Set(['.git','node_modules','.venv','venv','__pycache__']);
const status=()=>directory?'Folder: '+directory.name+(P.signature(project)===savedSignature?' · saved':' · unsaved changes'):'';
window.CodeixWorkspaceStatus=status;
function update(){for(const id of ['saveWorkspace','reloadWorkspace','disconnectWorkspace'])$('#'+id).hidden=!directory;$('#saveWorkspace').disabled=busy;$('#reloadWorkspace').disabled=busy;$('#openWorkspace').disabled=busy;if(directory)$('#saveStatus').textContent=status();}
function disconnect(){directory=null;originals=new Map();savedSignature='';update();$('#saveStatus').textContent='● Saved in browser';}
window.CodeixDisconnectWorkspace=disconnect;
async function scan(handle){
 const files=[],disk=new Map();let skipped=0,visited=0;
 async function walk(dir,prefix=''){
  for await(const [name,entry] of dir.entries()){
   if(++visited>5000)throw Error('Folder contains too many entries. Choose a smaller workspace.');
   if(ignored.has(name)){skipped++;continue;}
   const path=prefix+name;
   if(entry.kind==='directory'){if(path.split('/').length>20){skipped++;continue;}await walk(entry,path+'/');continue;}
   try{P.path(path);const f=await entry.getFile();const text=await decode(f);files.push({path,content:text});disk.set(path,text);}catch{skipped++;continue;}
   P.validate({name:handle.name,files});
  }
 }
 await walk(handle);return {next:P.validate({name:handle.name,files}),disk,skipped};
}
async function load(handle){
 const {next,disk,skipped}=await scan(handle);
 if(controller)controller.abort();checkpoint();project=next;active=next.files[0]?.path||null;tabs=active?[active]:[];
 directory=handle;originals=disk;savedSignature=P.signature(project);save();render();update();
 toast('Opened '+next.files.length+' text files'+(skipped?' · '+skipped+' entries skipped':'')+'. Changes stay in the browser until Save to folder.');
}
async function diskFile(path){
 let dir=directory;const parts=P.path(path).split('/');
 try{for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part);const h=await dir.getFileHandle(parts.at(-1));return await (await h.getFile()).text();}
 catch(e){if(e.name==='NotFoundError')return null;throw e;}
}
async function parent(path,create){let dir=directory;const parts=P.path(path).split('/');for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part,{create});return {dir,name:parts.at(-1)};}
async function persist(){
 if(!directory||busy)return;busy=true;update();
 try{
  if(await directory.requestPermission({mode:'readwrite'})!=='granted')throw Error('Folder write permission was not granted.');
  const current=P.validate(copy(project)),signature=P.signature(current),next=new Map(current.files.map(f=>[f.path,f.content]));
  const writes=current.files.filter(f=>!originals.has(f.path)||f.content!==originals.get(f.path));
  const removes=[...originals.keys()].filter(path=>!next.has(path));
  if(!writes.length&&!removes.length){savedSignature=signature;return toast('Folder is up to date.');}
  if(!confirm('Save to '+directory.name+'?\nWrite '+writes.length+' files; delete '+removes.length+' files.\n'+[...writes.map(f=>'WRITE '+f.path),...removes.map(p=>'DELETE '+p)].join('\n')))return;
  // Preflight every affected path before making any disk change.
  for(const path of [...writes.map(f=>f.path),...removes]){
   const actual=await diskFile(path),expected=originals.has(path)?originals.get(path):null;
   if(actual!==expected)throw Error('External change detected: '+path+'. Reload the folder or export a backup before saving.');
  }
  if(P.signature(project)!==signature)throw Error('Project changed while preparing the save. Save again.');
  for(const f of writes){const {dir,name}=await parent(f.path,true),h=await dir.getFileHandle(name,{create:true}),stream=await h.createWritable();try{await stream.write(f.content);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}originals.set(f.path,f.content);}
  for(const path of removes){const {dir,name}=await parent(path,false);await dir.removeEntry(name);originals.delete(path);}
  savedSignature=signature;toast('Saved workspace to '+directory.name+'.');
 }catch(e){toast('Folder save stopped: '+e.message+' Some earlier writes may have completed; export a backup if needed.');}
 finally{busy=false;update();}
}
window.CodeixSaveWorkspace=persist;
$('#openWorkspace').onclick=async()=>{
 if(!window.showDirectoryPicker)return toast('Local folders require a supported Chromium browser on HTTPS or localhost. Use Import folder and Export ZIP instead.');
 try{const handle=await showDirectoryPicker({id:'codeix-workspace',mode:'readwrite'});if(!confirm('Replace the current editor project with '+handle.name+'? Export unsaved work first.'))return;busy=true;update();await load(handle);}catch(e){if(e.name!=='AbortError')toast('Could not open folder: '+e.message);}finally{busy=false;update();}
};
$('#saveWorkspace').onclick=persist;
$('#reloadWorkspace').onclick=async()=>{if(busy||!directory||!confirm('Reload files from disk and discard current editor changes?'))return;busy=true;update();try{await load(directory);}catch(e){toast('Reload failed: '+e.message);}finally{busy=false;update();}};
$('#disconnectWorkspace').onclick=()=>{if(!busy){disconnect();toast('Folder disconnected. Project remains in browser storage.');}};
window.addEventListener('codeix-project-change',update);
window.addEventListener('beforeunload',e=>{if(directory&&P.signature(project)!==savedSignature){e.preventDefault();e.returnValue='';}});
update();
})();
