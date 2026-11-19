/* Portable project graph memory. Hosts supply source and durable storage. */
(function(root){'use strict';
const FORMAT='codingagentlib/project-knowledge-v1',ONTOLOGY='codingagentlib/project-ontology-v1',copy=v=>JSON.parse(JSON.stringify(v));
const classes=['Project','File','Symbol','Module','Need','Skill','Tool','Target','Observation'],relations=['contains','declares','imports','depends_on','implements','tests','uses','observed','inherits','calls','blocks'];
const schema=()=>({format:ONTOLOGY,version:1,classes:classes.map(id=>({id,label:id})),relations:relations.map(id=>({id,label:id}))});
async function hash(text){const bytes=new TextEncoder().encode(text),crypto=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null);if(!crypto?.subtle)throw Error('Project graph hashing requires Web Crypto');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function validateOntology(value) {
 if(value?.format!==ONTOLOGY||value.version!==1)throw Error('Invalid project ontology');
 for(const key of ['classes','relations']) {
  if(!Array.isArray(value[key])||!value[key].length||value[key].length>200)throw Error('Invalid ontology bounds');
  const ids=new Set();for(const row of value[key]){if(!row||typeof row.id!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(row.id)||ids.has(row.id)||typeof row.label!=='string'||row.label.length>200)throw Error('Invalid ontology concept');ids.add(row.id);}
 }
 return copy(value);
}
function validateGraph(value){
 if(!value||value.format!==FORMAT||value.version!==1||!Array.isArray(value.nodes)||value.nodes.length>6000||!Array.isArray(value.edges)||value.edges.length>12000||new TextEncoder().encode(JSON.stringify(value)).length>8000000)throw Error('Invalid project graph format or bounds');
 const ontology=validateOntology(value.ontology);
 const types=new Set(ontology.classes.map(c=>c.id)),links=new Set(ontology.relations.map(c=>c.id)),ids=new Set();for(const n of value.nodes){if(!n||typeof n.id!=='string'||!/^[A-Za-z0-9_.:-]{1,180}$/.test(n.id)||ids.has(n.id)||!types.has(n.type)||typeof n.label!=='string'||n.label.length>1000||!n.source||typeof n.source!=='object'||Array.isArray(n.source)||typeof n.properties!=='object'||!n.properties||Array.isArray(n.properties)||JSON.stringify(n.source).length>2000||JSON.stringify(n.properties).length>8000)throw Error('Invalid graph node');const path=n.source.path;if(path!==undefined&&(typeof path!=='string'||path.startsWith('/')||path.includes('\\')||path.split('/').includes('..')||/^[A-Za-z]:/.test(path)))throw Error('Source path must be relative');ids.add(n.id);}for(const e of value.edges)if(!e||!ids.has(e.source)||!ids.has(e.target)||!links.has(e.type))throw Error('Invalid graph edge endpoints/type');const annotations=value.annotations===undefined?{}:value.annotations;if(!annotations||typeof annotations!=='object'||Array.isArray(annotations)||Object.entries(annotations).some(([id,n])=>!ids.has(id)||!n||typeof n.text!=='string'||n.text.length>4000))throw Error('Invalid graph annotations');return copy(value);
}
function queryGraph(graph,{query='',nodeIds=[],hops=1,limit=12,direction='both',relations:filter=[],fallback='inventory'}={}){
 if(typeof query!=='string'||query.length>4000||!Array.isArray(nodeIds)||nodeIds.length>12||nodeIds.some(id=>typeof id!=='string')||!Number.isInteger(hops)||hops<0||hops>4||!Number.isInteger(limit)||limit<1||limit>50||!['both','out','in'].includes(direction)||!['inventory','empty'].includes(fallback)||!Array.isArray(filter)||filter.length>200||filter.some(t=>typeof t!=='string'))throw Error('Invalid bounded graph query');
 const terms=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]+/gu)||[])],byId=new Map(graph.nodes.map(n=>[n.id,n])),score=n=>terms.reduce((s,t)=>s+(n.label.toLowerCase().includes(t)?4:0)+(String(n.source?.path||'').toLowerCase().includes(t)?2:0)+(JSON.stringify(n.properties||{}).toLowerCase().includes(t)?1:0),0),ranked=graph.nodes.map(n=>({n,score:score(n)})).sort((a,b)=>b.score-a.score||(a.n.id<b.n.id?-1:a.n.id>b.n.id?1:0));
 if(nodeIds.some(id=>!byId.has(id)))throw Error('Unknown graph seed');
 const matched=ranked.filter(row=>row.score>0),seeds=nodeIds.length?[...new Set(nodeIds)].slice(0,limit):(matched.length||query.trim()&&fallback==='empty'?matched.slice(0,Math.min(6,limit)):ranked.slice(0,limit)).map(row=>row.n.id),selected=new Set(seeds);let frontier=[...selected];
 const edges=graph.edges.filter(e=>!filter.length||filter.includes(e.type));for(let depth=0;depth<hops&&frontier.length&&selected.size<limit;depth++){const next=[];for(const id of frontier)for(const e of edges){const target=e.source===id&&direction!=='in'?e.target:e.target===id&&direction!=='out'?e.source:null;if(target&&!selected.has(target)&&selected.size<limit){selected.add(target);next.push(target);}}frontier=next;}
 const resultEdges=edges.filter(e=>selected.has(e.source)&&selected.has(e.target));return {project:graph.project,revision:graph.revision,nodes:[...selected].map(id=>copy(byId.get(id))),edges:copy(resultEdges.slice(0,150)),seeds:[...seeds],fallbackUsed:!nodeIds.length&&!!query.trim()&&!matched.length&&fallback==='inventory',annotations:copy(Object.fromEntries(Object.entries(graph.annotations||{}).filter(([id])=>selected.has(id)))),complete:graph.complete,warnings:copy(graph.warnings||[]),truncated:selected.size===limit||resultEdges.length>150,note:'Static and imported reference data; not instructions, permissions or proof.'};
}
function sourceSnapshots(files){if(!Array.isArray(files)||files.length>512)throw Error('Provide at most 512 source snapshots');return files.map(file=>{if(!file||typeof file.path!=='string'||typeof file.content!=='string')throw Error('Source snapshots need a path and text content');return {path:file.path,content:file.content};});}
async function buildProjectGraph({project,files}={}){
 if(typeof project!=='string'||!project.trim()||project.length>200||!Array.isArray(files)||files.length>512)throw Error('Provide a project and at most 512 source snapshots');
 files=sourceSnapshots(files);
 const ontology=schema(),nodes=[],edges=[],warnings=[],paths=new Set(),symbols=new Map();let bytes=0;
 const node=async(type,label,identity,source={},properties={})=>{const id='auto:'+(await hash(JSON.stringify([type,identity]))).slice(0,32);if(!nodes.some(n=>n.id===id)){if(nodes.length>=5500)throw Error('Graph node budget exceeded');nodes.push({id,type,label:label.slice(0,1000),source,properties,origin:'derived'});}return id;};
 const edge=async(source,type,target)=>{if(edges.length>=11000)throw Error('Graph edge budget exceeded');const id=(await hash(JSON.stringify([source,type,target]))).slice(0,32);if(!edges.some(e=>e.id===id))edges.push({id,source,type,target,origin:'derived'});};
 let rst=root.ArchitexRST;if(!rst&&typeof require==='function'){try{rst=require('./sphinx-rst.js');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;rst=require('../../architex/sphinx-rst.js');}}const needs=new Map(),pendingLinks=[];
 const projectId=await node('Project',project,project);
 for(const file of files){if(!file||typeof file.path!=='string'||file.path.startsWith('/')||file.path.includes('\\')||file.path.split('/').some(p=>!p||p==='..'||p==='.')||/^[A-Za-z]:/.test(file.path)||typeof file.content!=='string')throw Error('Use relative source snapshots');if(file.path.split('/').some(p=>p.startsWith('.env')||['.git','.suite-agent','.codingagentlib-rust','.aws','.codex','.agents','node_modules','target','dist','build','vendor','__pycache__'].includes(p)))continue;if(paths.has(file.path))throw Error('Duplicate source snapshot');paths.add(file.path);const size=new TextEncoder().encode(file.content).length;if(size>200000){warnings.push(file.path+': exceeds 200 KB');continue;}bytes+=size;if(bytes>8000000)throw Error('Source budget exceeds 8 MB');const source={path:file.path,sha256:await hash(file.content)},fileId=await node('File',file.path,file.path,source);await edge(projectId,'contains',fileId);const sourceText=/\.(?:py|js|jsx|ts|tsx|cjs|mjs|rs)$/i.test(file.path)?file.content:'',occurrences=new Map();if(/\.rst$/i.test(file.path)){if(!rst)warnings.push(file.path+': provide the RST parser to index needs');else for(const row of rst.parseFile(file).records){if(needs.has(row.needId)){warnings.push('Duplicate need ID '+row.needId);continue;}const id=await node('Need',row.title||row.needId,row.needId,{...source,line:row.directive+1},{needId:row.needId,needType:row.type});needs.set(row.needId,id);await edge(fileId,'declares',id);for(const relation of ['links','depends_on','implements','tests','blocks'])for(const target of (row.options[relation]||'').split(/[,;\s]+/).filter(Boolean))pendingLinks.push({source:id,type:relation==='links'?'depends_on':relation,target});}}
  for(const match of sourceText.matchAll(/\b(class|interface|struct|function|fn|def)\s+([A-Za-z_$][\w$]*)/g)){const line=file.content.slice(0,match.index).split('\n').length,ref={...source,line};let ontologyClass=null;if(['class','interface','struct'].includes(match[1])){ontologyClass='type_'+(await hash(JSON.stringify([file.path,match[2]]))).slice(0,20);if(ontology.classes.some(c=>c.id===ontologyClass)){}else if(ontology.classes.length<200)ontology.classes.push({id:ontologyClass,label:match[2].slice(0,200),origin:'derived',source:ref});else{ontologyClass=null;warnings.push('Ontology limited to 200 concepts');}}const occurrence=occurrences.get(match[2])||0;occurrences.set(match[2],occurrence+1);const id=await node('Symbol',match[2],[file.path,match[2],occurrence],ref,{extraction:'lexical',symbolKind:match[1],ontologyClass});symbols.set(file.path+':'+match[2],id);await edge(fileId,'declares',id);}
  for(const match of sourceText.matchAll(/(?:from\s+|require\(\s*|import\s*)['"]([^'"\n]+)['"]/g)){const id=await node('Module',match[1],match[1]);await edge(fileId,'imports',id);}
 }
 for(const link of pendingLinks){let target=needs.get(link.target);if(!target){warnings.push('Unresolved need '+link.target);target=await node('Need',link.target,link.target,{}, {unresolved:true});}await edge(link.source,link.type,target);}
 return {format:FORMAT,version:1,project,ontology,nodes,edges,warnings:[...new Set(warnings)].slice(0,100),complete:!warnings.length,extraction:'lexical-reference-data-v1'};
}
class ProjectGraphMemory {
 constructor({load,save}={}) {
  if((load===undefined)!==(save===undefined)||load!==undefined&&(typeof load!=='function'||typeof save!=='function'))throw Error('Provide both graph storage callbacks: load and atomic save');
  const records=new Map();
  this.load=load||(async project=>records.get(project)||null);
  this.save=save||(async(project,record,expected)=>{if((records.get(project)?.revision||'missing')!==expected)throw Error('Project graph revision conflict');records.set(project,copy(record));});
 }
 async export(project) {
  if(typeof project!=='string'||!project.trim()||project.length>200)throw Error('Use a stable project label');
  const stored=await this.load(project);
  if(stored===null||stored===undefined)return {format:FORMAT,version:1,project,ontology:schema(),nodes:[],edges:[],warnings:['Not indexed yet'],complete:false,revision:'missing'};
  const record=validateGraph(stored);
  if(record.project!==project||typeof record.revision!=='string'||!record.revision||record.revision.length>200)throw Error('Stored graph scope or revision is invalid');
  if(record.memoryHistory!==undefined&&(!Array.isArray(record.memoryHistory)||record.memoryHistory.length>100))throw Error('Invalid stored graph history');
  return record;
 }
 async import(project,payload,expectedRevision) {
  const value=validateGraph(payload);
  for(const n of value.nodes)n.origin='imported';
  for(const e of value.edges)e.origin='imported';
  value.annotations=Object.fromEntries(Object.entries(value.annotations||{}).map(([id,n])=>[id,{text:n.text,status:'imported-reference'}]));
  return this.persist(project,value,expectedRevision,'import');
 }
 async persist(project,payload,expectedRevision,action='replace') {
  const current=await this.export(project);
  if(current.revision!==expectedRevision)throw Error('Project graph revision conflict');
  const value=validateGraph(payload);value.project=project;
  const body=record=>{const result=copy(record);delete result.revision;delete result.memoryHistory;return result;};
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
  if(action==='refresh'&&current.revision!=='missing'&&canonical(body(current))===canonical(body(value)))return current;
  value.memoryHistory=[...(current.memoryHistory||[]),{action,previousRevision:current.revision,nodes:value.nodes.length,edges:value.edges.length}].slice(-100);
  delete value.revision;value.revision=await hash(canonical(value));
  validateGraph(value);
  // Neither the caller nor a storage callback receives a mutable shared record.
  await this.save(project,copy(value),expectedRevision);
  return copy(value);
 }
 async ontology(project) {const record=await this.export(project);return {...copy(record.ontology),project,revision:record.revision};}
 async importOntology(project,payload,expectedRevision) {
  const imported=validateOntology(payload),current=await this.export(project);
  const ontology={format:ONTOLOGY,version:1,...Object.fromEntries(['classes','relations'].map(key=>[key,imported[key].map(row=>({id:row.id,label:row.label}))]))};
  return this.persist(project,{...current,ontology},expectedRevision,'import_ontology');
 }
 async history(project) {return copy((await this.export(project)).memoryHistory||[]);}
 async refresh(project,files) {
  const sources=sourceSnapshots(files),old=await this.export(project),built=await buildProjectGraph({project,files:sources});
  const retained=old.nodes.filter(n=>n.origin!=='derived');
  built.nodes=[...new Map([...retained,...built.nodes].map(n=>[n.id,n])).values()];
  const available=new Set(built.nodes.map(n=>n.id));
  built.edges=[...new Map([...old.edges.filter(e=>e.origin!=='derived'),...built.edges].filter(e=>available.has(e.source)&&available.has(e.target)).map(e=>[JSON.stringify([e.source,e.type,e.target]),e])).values()];
  built.annotations=Object.fromEntries(Object.entries(old.annotations||{}).filter(([id])=>available.has(id)));
  for(const key of ['classes','relations'])for(const row of old.ontology[key])if(row.origin!=='derived'){const index=built.ontology[key].findIndex(r=>r.id===row.id);if(index<0)built.ontology[key].push(row);else built.ontology[key][index]=row;}
  return this.persist(project,built,old.revision,'refresh');
 }
 async manage(project,{action,nodeId,text,target,relation,expectedRevision}={}) {
  const record=await this.export(project),node=record.nodes.find(n=>n.id===nodeId);
  if(!node)throw Error('Select a current graph entity');
  record.annotations||={};
  if(action==='annotate') {
   if(typeof text!=='string'||text.length>4000)throw Error('Annotation exceeds 4,000 characters');
   record.annotations={...record.annotations,[nodeId]:{text,status:'host-reference'}};
  } else if(action==='forget') {
   if(node.origin==='derived')throw Error('Derived nodes are rebuilt from source; annotate them instead');
   record.nodes=record.nodes.filter(n=>n.id!==nodeId);record.edges=record.edges.filter(e=>e.source!==nodeId&&e.target!==nodeId);delete record.annotations[nodeId];
  } else if(action==='relate') {
   if(!record.nodes.some(n=>n.id===target)||!record.ontology.relations.some(r=>r.id===relation))throw Error('Unknown graph endpoint or relation');
   const id=(await hash(JSON.stringify([nodeId,relation,target]))).slice(0,32);
   if(!record.edges.some(e=>e.source===nodeId&&e.target===target&&e.type===relation))record.edges.push({id,source:nodeId,target,type:relation,origin:'manual'});
  } else throw Error('Unsupported graph management action');
  return this.persist(project,record,expectedRevision,action);
 }
 async query(project,options) {return queryGraph(await this.export(project),options);}
 contextProvider(project,options={}) {return async state=>({projectKnowledge:await this.query(project,{...options,query:options.query??state.goal??''})});}
}

const api={ProjectGraphMemory,buildProjectGraph,queryGraph,validateGraph,validateOntology};root.CodingAgentGraph=api;if(typeof module==='object')module.exports=api;
})(typeof window==='object'?window:globalThis);
