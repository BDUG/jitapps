/* CNCF landscape diagrams are data. No external network requests or scripts are executed. */
(function(root){'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v));
 const uid=(prefix='item')=>root.crypto?.randomUUID?.()||prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);

 const MATURITIES=['graduated','incubating','sandbox','platform','non-cncf'];
 const MATURITY_META={
  graduated:{label:'Graduated',color:'#1e5a8a',fill:'#e8f1f8',border:'#1e5a8a'},
  incubating:{label:'Incubating',color:'#8b1e3f',fill:'#f7eef1',border:'#8b1e3f'},
  sandbox:{label:'Sandbox',color:'#b86512',fill:'#fdf3e8',border:'#d97a16'},
  platform:{label:'Platform',color:'#2e6b4e',fill:'#eaf4ef',border:'#2e6b4e'},
  'non-cncf':{label:'Non-CNCF',color:'#5a6470',fill:'#f1f3f5',border:'#8b949e'}
 };

 const CNCF_CATALOG=[
  {name:'Kubernetes',category:'Orchestration & Management',subcategory:'Scheduling & Orchestration',maturity:'graduated',oss:true,homepage:'https://kubernetes.io',repo:'https://github.com/kubernetes/kubernetes',description:'Production-grade container scheduling and orchestration.'},
  {name:'containerd',category:'Runtime',subcategory:'Container Runtime',maturity:'graduated',oss:true,homepage:'https://containerd.io',repo:'https://github.com/containerd/containerd',description:'Industry-standard container runtime with emphasis on simplicity and portability.'},
  {name:'etcd',category:'Orchestration & Management',subcategory:'Coordination & Service Discovery',maturity:'graduated',oss:true,homepage:'https://etcd.io',repo:'https://github.com/etcd-io/etcd',description:'Distributed reliable key-value store for critical cluster state.'},
  {name:'CoreDNS',category:'Orchestration & Management',subcategory:'Coordination & Service Discovery',maturity:'graduated',oss:true,homepage:'https://coredns.io',repo:'https://github.com/coredns/coredns',description:'Flexible, extensible DNS server for service discovery.'},
  {name:'Helm',category:'App Definition & Development',subcategory:'Application Definition & Image Build',maturity:'graduated',oss:true,homepage:'https://helm.sh',repo:'https://github.com/helm/helm',description:'The package manager for Kubernetes.'},
  {name:'Argo',category:'App Definition & Development',subcategory:'Continuous Integration & Delivery',maturity:'graduated',oss:true,homepage:'https://argoproj.github.io',repo:'https://github.com/argoproj/argo-cd',description:'Declarative GitOps continuous delivery and workflows for Kubernetes.'},
  {name:'Flux',category:'App Definition & Development',subcategory:'Continuous Integration & Delivery',maturity:'graduated',oss:true,homepage:'https://fluxcd.io',repo:'https://github.com/fluxcd/flux2',description:'Open and extensible continuous delivery solution for Kubernetes.'},
  {name:'Prometheus',category:'Observability & Analysis',subcategory:'Monitoring',maturity:'graduated',oss:true,homepage:'https://prometheus.io',repo:'https://github.com/prometheus/prometheus',description:'Time-series monitoring and alerting toolkit.'},
  {name:'OpenTelemetry',category:'Observability & Analysis',subcategory:'Tracing',maturity:'incubating',oss:true,homepage:'https://opentelemetry.io',repo:'https://github.com/open-telemetry',description:'Vendor-neutral telemetry framework for traces, metrics, and logs.'},
  {name:'Jaeger',category:'Observability & Analysis',subcategory:'Tracing',maturity:'graduated',oss:true,homepage:'https://www.jaegertracing.io',repo:'https://github.com/jaegertracing/jaeger',description:'Distributed tracing platform for microservices.'},
  {name:'Fluentd',category:'Observability & Analysis',subcategory:'Logging',maturity:'graduated',oss:true,homepage:'https://www.fluentd.org',repo:'https://github.com/fluent/fluentd',description:'Unified logging layer for collecting and routing log streams.'},
  {name:'Envoy',category:'Orchestration & Management',subcategory:'Service Proxy',maturity:'graduated',oss:true,homepage:'https://www.envoyproxy.io',repo:'https://github.com/envoyproxy/envoy',description:'High-performance edge and service proxy.'},
  {name:'Istio',category:'Orchestration & Management',subcategory:'Service Mesh',maturity:'graduated',oss:true,homepage:'https://istio.io',repo:'https://github.com/istio/istio',description:'Open service mesh for traffic management, security, and observability.'},
  {name:'Cilium',category:'Runtime',subcategory:'Cloud Native Network',maturity:'graduated',oss:true,homepage:'https://cilium.io',repo:'https://github.com/cilium/cilium',description:'eBPF-based networking, observability, and security.'},
  {name:'Harbor',category:'Provisioning',subcategory:'Container Registry',maturity:'graduated',oss:true,homepage:'https://goharbor.io',repo:'https://github.com/goharbor/harbor',description:'Trusted cloud native container registry with vulnerability scanning.'},
  {name:'Falco',category:'Provisioning',subcategory:'Security & Compliance',maturity:'graduated',oss:true,homepage:'https://falco.org',repo:'https://github.com/falcosecurity/falco',description:'Cloud native runtime security and threat detection.'},
  {name:'OPA',category:'Provisioning',subcategory:'Security & Compliance',maturity:'graduated',oss:true,homepage:'https://www.openpolicyagent.org',repo:'https://github.com/open-policy-agent/opa',description:'General-purpose policy engine for unified policy enforcement.'},
  {name:'SPIFFE / SPIRE',category:'Provisioning',subcategory:'Key Management',maturity:'graduated',oss:true,homepage:'https://spiffe.io',repo:'https://github.com/spiffe/spire',description:'Workload identity framework and runtime.'},
  {name:'cert-manager',category:'Provisioning',subcategory:'Key Management',maturity:'incubating',oss:true,homepage:'https://cert-manager.io',repo:'https://github.com/cert-manager/cert-manager',description:'Automated X.509 certificate management in Kubernetes.'},
  {name:'Kyverno',category:'Provisioning',subcategory:'Security & Compliance',maturity:'incubating',oss:true,homepage:'https://kyverno.io',repo:'https://github.com/kyverno/kyverno',description:'Kubernetes-native policy management.'},
  {name:'Crossplane',category:'App Definition & Development',subcategory:'Application Definition & Image Build',maturity:'incubating',oss:true,homepage:'https://www.crossplane.io',repo:'https://github.com/crossplane/crossplane',description:'Cloud native control planes for infrastructure and services.'},
  {name:'Backstage',category:'App Definition & Development',subcategory:'Application Definition & Image Build',maturity:'incubating',oss:true,homepage:'https://backstage.io',repo:'https://github.com/backstage/backstage',description:'Open platform for building internal developer portals.'},
  {name:'Knative',category:'Serverless',subcategory:'Installable Platform',maturity:'incubating',oss:true,homepage:'https://knative.dev',repo:'https://github.com/knative/serving',description:'Kubernetes-based platform to deploy and manage serverless workloads.'},
  {name:'Rook',category:'Runtime',subcategory:'Cloud Native Storage',maturity:'graduated',oss:true,homepage:'https://rook.io',repo:'https://github.com/rook/rook',description:'Cloud-native storage orchestrator for Kubernetes.'}
 ];

 function makeCategory(name,color='#1e5a8a',id=uid('cat')){return {id,name,color};}
 function makeSubcategory(categoryId,name,id=uid('sub')){return {id,categoryId,name};}
 function makeItem(categoryId,subcategoryId,data={}){
  return {
   id:data.id||uid('item'),
   name:data.name||'New Project',
   categoryId,
   subcategoryId,
   maturity:MATURITIES.includes(data.maturity)?data.maturity:'sandbox',
   oss:data.oss!==false,
   homepage:data.homepage||'',
   repo:data.repo||'',
   description:data.description||'',
   notes:data.notes||''
  };
 }

 function buildFromCatalog(name,subtitle,projectNames,columns=4){
  const categories=[],subcategories=[],items=[];
  const catByName=new Map(),subByKey=new Map();
  for(const pName of projectNames){
   const entry=CNCF_CATALOG.find(c=>c.name===pName);
   if(!entry)continue;
   if(!catByName.has(entry.category)){
    const cat=makeCategory(entry.category);
    catByName.set(entry.category,cat);
    categories.push(cat);
   }
   const cat=catByName.get(entry.category);
   const key=cat.id+'::'+entry.subcategory;
   if(!subByKey.has(key)){
    const sub=makeSubcategory(cat.id,entry.subcategory);
    subByKey.set(key,sub);
    subcategories.push(sub);
   }
   const sub=subByKey.get(key);
   items.push(makeItem(cat.id,sub.id,entry));
  }
  return {
   format:'cncfix-project',
   version:1,
   name,
   subtitle,
   activeItemId:items[0]?.id||null,
   activeCategoryId:categories[0]?.id||null,
   categories,
   subcategories,
   items,
   settings:{columns,showLegend:true,showMaturity:true,showOssBadge:true,cardWidth:156}
  };
 }

 const templates=[
  {id:'cncf-core',name:'CNCF Cloud Native Core',group:'Complete',description:'Balanced multi-category CNCF stack across runtime, orchestration, app delivery, observability & security.',build:()=>buildFromCatalog('CNCF Cloud Native Landscape','Core graduated & incubating cloud native ecosystem',['Kubernetes','Envoy','Istio','etcd','CoreDNS','containerd','Cilium','Rook','Helm','Argo','Crossplane','Backstage','Prometheus','OpenTelemetry','Jaeger','Fluentd','Harbor','Falco','OPA','cert-manager'],4)},
  {id:'observability',name:'Observability & Service Mesh',group:'Focused',description:'Metrics, distributed tracing, logging, and eBPF/proxy service mesh.',build:()=>buildFromCatalog('Observability & Mesh Landscape','Telemetry, proxies, and eBPF networking',['Prometheus','OpenTelemetry','Jaeger','Fluentd','Envoy','Istio','Cilium'],2)},
  {id:'security',name:'Supply Chain & Zero-Trust Security',group:'Focused',description:'Registry scanning, policy engines, runtime threat detection, and workload identity.',build:()=>buildFromCatalog('Cloud Native Security Landscape','Policy, identity, certificates, and runtime defense',['Harbor','Falco','OPA','Kyverno','SPIFFE / SPIRE','cert-manager'],2)},
  {id:'platform',name:'Internal Developer Platform',group:'Platform',description:'GitOps, developer portals, control planes, and serverless workloads.',build:()=>buildFromCatalog('Internal Developer Platform','GitOps, portals, and serverless building blocks',['Kubernetes','Helm','Argo','Flux','Crossplane','Backstage','Knative'],3)}
 ];

 function create(blank=false){
  if(!blank)return templates[0].build();
  const cat=makeCategory('Orchestration & Management');
  const sub=makeSubcategory(cat.id,'Scheduling & Orchestration');
  const item=makeItem(cat.id,sub.id,{name:'Kubernetes',maturity:'graduated',oss:true,homepage:'https://kubernetes.io',description:'Container orchestration platform.'});
  return {
   format:'cncfix-project',
   version:1,
   name:'Untitled CNCF Landscape',
   subtitle:'Cloud native architecture map',
   activeItemId:item.id,
   activeCategoryId:cat.id,
   categories:[cat],
   subcategories:[sub],
   items:[item],
   settings:{columns:3,showLegend:true,showMaturity:true,showOssBadge:true,cardWidth:156}
  };
 }

 function validate(raw){
  if(!raw||raw.format!=='cncfix-project'||raw.version!==1)throw Error('Choose a cncfiX version 1 project.');
  const text=(v,n,max)=>{if(typeof v!=='string'||v.length>max)throw Error(n+' must be text up to '+max+' characters.');return v;};
  text(raw.name,'Landscape name',160);if(!raw.name.trim())throw Error('Give the landscape a name.');
  text(raw.subtitle??'','Subtitle',240);
  if(!Array.isArray(raw.categories)||raw.categories.length<1||raw.categories.length>40)throw Error('A landscape needs 1–40 categories.');
  const catIds=new Set();
  const categories=raw.categories.map(c=>{
   if(!c||typeof c.id!=='string'||!/^[\w-]{1,80}$/.test(c.id)||catIds.has(c.id))throw Error('Category IDs must be unique.');
   catIds.add(c.id);
   text(c.name,'Category name',120);if(!c.name.trim())throw Error('Category name cannot be empty.');
   const color=/^#[a-f0-9]{6}$/i.test(c.color||'')?c.color:'#1e5a8a';
   return {id:c.id,name:c.name,color};
  });
  if(!Array.isArray(raw.subcategories)||raw.subcategories.length<1||raw.subcategories.length>120)throw Error('A landscape needs 1–120 subcategories.');
  const subIds=new Set();
  const subcategories=raw.subcategories.map(s=>{
   if(!s||typeof s.id!=='string'||!/^[\w-]{1,80}$/.test(s.id)||subIds.has(s.id))throw Error('Subcategory IDs must be unique.');
   if(!catIds.has(s.categoryId))throw Error('Subcategory must reference an existing category.');
   subIds.add(s.id);
   text(s.name,'Subcategory name',120);if(!s.name.trim())throw Error('Subcategory name cannot be empty.');
   return {id:s.id,categoryId:s.categoryId,name:s.name};
  });
  if(!Array.isArray(raw.items)||raw.items.length>500)throw Error('A landscape supports up to 500 items.');
  const itemIds=new Set();
  const items=raw.items.map(it=>{
   if(!it||typeof it.id!=='string'||!/^[\w-]{1,80}$/.test(it.id)||itemIds.has(it.id))throw Error('Item IDs must be unique.');
   if(!catIds.has(it.categoryId)||!subIds.has(it.subcategoryId))throw Error('Each item must belong to an existing category and subcategory.');
   itemIds.add(it.id);
   text(it.name,'Item name',120);if(!it.name.trim())throw Error('Item name cannot be empty.');
   if(!MATURITIES.includes(it.maturity))throw Error('Maturity must be graduated, incubating, sandbox, platform, or non-cncf.');
   text(it.homepage??'','Homepage URL',400);
   text(it.repo??'','Repository URL',400);
   text(it.description??'','Description',1000);
   text(it.notes??'','Notes',4000);
   return {id:it.id,name:it.name,categoryId:it.categoryId,subcategoryId:it.subcategoryId,maturity:it.maturity,oss:it.oss!==false,homepage:it.homepage||'',repo:it.repo||'',description:it.description||'',notes:it.notes||''};
  });
  const s=raw.settings||{};
  const columns=Number.isInteger(s.columns)&&s.columns>=1&&s.columns<=6?s.columns:4;
  const cardWidth=Number.isInteger(s.cardWidth)&&s.cardWidth>=110&&s.cardWidth<=240?s.cardWidth:156;
  const activeItemId=raw.activeItemId&&itemIds.has(raw.activeItemId)?raw.activeItemId:(items[0]?.id||null);
  const activeCategoryId=raw.activeCategoryId&&catIds.has(raw.activeCategoryId)?raw.activeCategoryId:categories[0].id;
  return {
   format:'cncfix-project',
   version:1,
   name:raw.name,
   subtitle:raw.subtitle||'',
   activeItemId,
   activeCategoryId,
   categories,
   subcategories,
   items,
   settings:{columns,showLegend:s.showLegend!==false,showMaturity:s.showMaturity!==false,showOssBadge:s.showOssBadge!==false,cardWidth}
  };
 }

 const yamlStr=v=>JSON.stringify(String(v||''));
 function toLandscapeYaml(project){
  const p=validate(project);
  const lines=['landscape:'];
  for(const cat of p.categories){
   lines.push('  - category:');
   lines.push('    name: '+yamlStr(cat.name));
   lines.push('    subcategories:');
   for(const sub of p.subcategories.filter(s=>s.categoryId===cat.id)){
    lines.push('      - subcategory:');
    lines.push('        name: '+yamlStr(sub.name));
    lines.push('        items:');
    for(const it of p.items.filter(i=>i.subcategoryId===sub.id)){
     lines.push('          - item:');
     lines.push('            name: '+yamlStr(it.name));
     if(it.homepage)lines.push('            homepage_url: '+yamlStr(it.homepage));
     if(it.repo)lines.push('            repo_url: '+yamlStr(it.repo));
     if(it.maturity!=='non-cncf')lines.push('            project: '+yamlStr(it.maturity));
     if(it.description)lines.push('            description: '+yamlStr(it.description));
    }
   }
  }
  return lines.join('\n')+'\n';
 }

 function fromLandscapeYaml(text,name='Imported CNCF Landscape'){
  const lines=String(text||'').replace(/^\uFEFF/,'').splitlines?String(text).splitlines():String(text||'').split(/\r?\n/);
  const categories=[],subcategories=[],items=[];
  let curCat=null,curSub=null,curItem=null;
  const clean=v=>{v=v.trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))return v.slice(1,-1);return v;};
  for(const rawLine of lines){
   const line=rawLine.trim();
   if(!line||line.startsWith('#'))continue;
   if(/^-?\s*category:/.test(line)){curCat=null;curSub=null;curItem=null;continue;}
   if(/^-?\s*subcategory:/.test(line)){curSub=null;curItem=null;continue;}
   if(/^-?\s*item:/.test(line)){if(curCat&&curSub){curItem=makeItem(curCat.id,curSub.id,{name:'Item'});items.push(curItem);}continue;}
   const m=/^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
   if(!m)continue;
   const[,key,val]=m;
   const value=clean(val);
   if(curItem){
    if(key==='name')curItem.name=value||'Item';
    else if(key==='homepage_url'||key==='homepage')curItem.homepage=value;
    else if(key==='repo_url'||key==='repo')curItem.repo=value;
    else if(key==='project'||key==='maturity')curItem.maturity=MATURITIES.includes(value)?value:'sandbox';
    else if(key==='description')curItem.description=value;
   }else if(!curCat&&key==='name'){
    curCat=makeCategory(value||'Category');categories.push(curCat);
   }else if(curCat&&!curSub&&key==='name'){
    curSub=makeSubcategory(curCat.id,value||'Subcategory');subcategories.push(curSub);
   }else if(curCat&&curSub&&key==='name'){
    curSub=makeSubcategory(curCat.id,value||'Subcategory');subcategories.push(curSub);
   }
  }
  if(!categories.length)throw Error('Could not find any CNCF landscape categories in YAML.');
  if(!subcategories.length)subcategories.push(makeSubcategory(categories[0].id,'General'));
  const p=create(true);
  p.name=name.slice(0,160)||'Imported CNCF Landscape';
  p.categories=categories;p.subcategories=subcategories;p.items=items;
  p.activeCategoryId=categories[0].id;p.activeItemId=items[0]?.id||null;
  return validate(p);
 }

 const schema={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  title:'cncfiX CNCF landscape project',
  type:'object',
  required:['format','version','name','categories','subcategories','items','settings'],
  properties:{
   format:{const:'cncfix-project'},
   version:{const:1},
   name:{type:'string',minLength:1,maxLength:160},
   subtitle:{type:'string',maxLength:240},
   activeItemId:{type:['string','null']},
   activeCategoryId:{type:['string','null']},
   categories:{type:'array',minItems:1,maxItems:40,items:{type:'object',required:['id','name','color'],properties:{id:{type:'string'},name:{type:'string'},color:{type:'string'}}}},
   subcategories:{type:'array',minItems:1,maxItems:120,items:{type:'object',required:['id','categoryId','name'],properties:{id:{type:'string'},categoryId:{type:'string'},name:{type:'string'}}}},
   items:{type:'array',maxItems:500,items:{type:'object',required:['id','name','categoryId','subcategoryId','maturity'],properties:{id:{type:'string'},name:{type:'string'},categoryId:{type:'string'},subcategoryId:{type:'string'},maturity:{enum:MATURITIES},oss:{type:'boolean'},homepage:{type:'string'},repo:{type:'string'},description:{type:'string'},notes:{type:'string'}}}},
   settings:{type:'object'}
  }
 };

 const api={copy,uid,MATURITIES,MATURITY_META,CNCF_CATALOG,makeCategory,makeSubcategory,makeItem,templates,create,validate,toLandscapeYaml,fromLandscapeYaml,schema};
 root.Cncfix=api;if(typeof module==='object')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
