/* Unapplied editor fields are data; only validated commits change RST. */
(function(root){'use strict';
const M=root.RstixModel||(typeof require==='function'?require('./model'):null),copy=M.copy,keys=['title','status','tags','body'];
const fields=node=>({title:node.title,status:node.status,tags:node.tags.join(', '),body:node.body});
const changed=entry=>keys.filter(key=>entry.fields[key]!==entry.base[key]);
const validFields=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>typeof value[key]==='string');
class Drafts {
 constructor(){this.sources=new Map();this.needs=new Map();this.name=null;this.revision=0;this.cache=new WeakMap();}
 graph(project){if(!this.cache.has(project))this.cache.set(project,M.graph(project));return this.cache.get(project);}
 count(){return this.sources.size+this.needs.size+Number(!!this.name);}
 pending(){return this.count()>0;}
 source(project,path){return this.sources.get(path)?.content??project.files.find(file=>file.path===path)?.content;}
 need(project,id){const node=this.graph(project).needs.find(node=>node.id===id);if(!node)throw Error('Need no longer exists: '+id);const current=fields(node),entry=this.needs.get(id);return entry?{...current,...Object.fromEntries(changed(entry).map(key=>[key,entry.fields[key]]))}:current;}
 setSource(project,path,content){const file=project.files.find(file=>file.path===path);if(!file||typeof content!=='string')throw Error('Choose an existing source file');if(content===file.content)this.sources.delete(path);else this.sources.set(path,{base:this.sources.get(path)?.base??file.content,content});this.revision++;}
 setNeed(project,id,value){if(!validFields(value))throw Error('Need fields must be text');const node=this.graph(project).needs.find(node=>node.id===id);if(!node)throw Error('Need no longer exists: '+id);const base=fields(node),previous=this.needs.get(id);if(previous)for(const key of changed(previous))base[key]=previous.base[key];const entry={base,fields:copy(value)};if(changed(entry).length)this.needs.set(id,entry);else this.needs.delete(id);this.revision++;}
 setName(project,value){if(typeof value!=='string')throw Error('Project name must be text');this.name=value===project.name?null:{base:this.name?.base??project.name,value};this.revision++;}
 discard({source,need,all=false}={}){if(all){this.sources.clear();this.needs.clear();this.name=null;}else{if(source)this.sources.delete(source);if(need)this.needs.delete(need);}this.revision++;}
 prepare(project,{source,need,name=false,all=false}={}){
  let next=copy(project);const sourceRows=all?[...this.sources]:source&&this.sources.has(source)?[[source,this.sources.get(source)]]:[];
  for(const [path,entry]of sourceRows){const file=next.files.find(file=>file.path===path);if(!file||file.content!==entry.base&&file.content!==entry.content)throw Error('Source changed since drafting: '+path+'. Review or discard this source draft.');file.content=entry.content;}
  if((all||name)&&this.name){if(next.name!==this.name.base&&next.name!==this.name.value)throw Error('Project name changed since drafting');next.name=this.name.value;}
  next=M.validate(next);
  const needRows=all?[...this.needs]:need&&this.needs.has(need)?[[need,this.needs.get(need)]]:[];
  for(const [id,entry]of needRows){const node=this.graph(next).needs.find(node=>node.id===id);if(!node)throw Error('Source removes a need with pending fields: '+id);if(!all&&this.sources.has(node.path))throw Error('Apply all pending edits to combine this need with its source draft');const current=fields(node),patch={};for(const key of changed(entry)){if(current[key]!==entry.base[key]&&current[key]!==entry.fields[key])throw Error('Conflicting source and need edits: '+id+'.'+key+'. Review or discard the need draft.');patch[key]=entry.fields[key];}next=M.edit(next,id,patch);}
  if(!all){const ids=new Set(this.graph(next).needs.map(node=>node.id));for(const id of this.needs.keys())if(id!==need&&!ids.has(id))throw Error('Source removes a need with pending fields: '+id+'. Discard its field draft first.');}
  return M.validate(next);
 }
 committed({source,need,name=false,all=false}={}){if(all)this.discard({all:true});else{this.discard({source,need});if(name)this.name=null;}}
 record(project){return {format:'rstix-editor-draft/v1',version:1,base:M.validate(project),sources:copy([...this.sources]),needs:copy([...this.needs]),name:copy(this.name)};}
 static decode(value){
  if(!value||value.format!=='rstix-editor-draft/v1'||value.version!==1||!Array.isArray(value.sources)||value.sources.length>500||!Array.isArray(value.needs)||value.needs.length>2000||new TextEncoder().encode(JSON.stringify(value)).length>30000000)throw Error('Invalid editor draft or 30 MB recovery limit exceeded');
  const base=M.validate(value.base),files=new Map(base.files.map(file=>[file.path,file])),ids=new Set(M.graph(base).needs.map(node=>node.id)),sourceIds=new Set(),needIds=new Set();
  for(const row of value.sources){if(!Array.isArray(row)||row.length!==2||!files.has(row[0])||sourceIds.has(row[0])||!row[1]||typeof row[1].content!=='string'||row[1].base!==files.get(row[0]).content)throw Error('Invalid source draft');sourceIds.add(row[0]);}
  for(const row of value.needs){if(!Array.isArray(row)||row.length!==2||!ids.has(row[0])||needIds.has(row[0])||!row[1]||!validFields(row[1].base)||!validFields(row[1].fields))throw Error('Invalid need-field draft');needIds.add(row[0]);}
  if(value.name!==null&&(!value.name||typeof value.name.base!=='string'||typeof value.name.value!=='string'||value.name.base!==base.name))throw Error('Invalid project-name draft');
  return {...copy(value),base};
 }
 restore(value){const record=Drafts.decode(value);this.sources=new Map(record.sources);this.needs=new Map(record.needs);this.name=record.name;this.revision++;return record.base;}
}
root.RstixDrafts=Drafts;if(typeof module==='object')module.exports=Drafts;
})(typeof window==='object'?window:globalThis);
