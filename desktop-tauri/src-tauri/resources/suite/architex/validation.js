/* Architex validation scripting API v2. Browser + CommonJS, no dependencies. */
(function(root){
'use strict';
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function effectivePorts(components,id,seen=new Set()){const c=components.find(c=>c.id===id);if(!c||seen.has(id))return [];const next=new Set(seen);next.add(id);const own=c.ports.map(p=>({...p,sourceComponentId:c.id,sourcePortId:p.id,exposurePath:[c.id],inherited:false}));for(const child of components.filter(n=>n.parentId===id))for(const p of effectivePorts(components,child.id,next))if(p.exposedToParent!==false)own.push({...p,id:'exposed:'+encodeURIComponent(p.sourceComponentId)+':'+encodeURIComponent(p.sourcePortId),exposurePath:[id,...p.exposurePath],inherited:true});return own;}
function policyAllows(policy,peerType,peerPolicy){return !!policy&&(policy.allowedComponentIds.includes(peerType)||!!peerPolicy?.inherited&&policy.allowedComponentIds.includes(peerPolicy.sourceComponentId));}
function createAPI(model,report){
 const snapshot=freeze(JSON.parse(JSON.stringify(model)));
 const components=snapshot.components,instances=snapshot.instances;
 const component=id=>components.find(c=>c.id===id);
 const instance=id=>instances.find(i=>i.id===id);
 const ports=id=>instance(id)?.ports||Object.freeze([]);
 const port=(id,pid)=>ports(id).find(p=>p.id===pid);
 const allowed=(source,target)=>{const s=instance(source.instanceId),t=instance(target.instanceId),sp=port(source.instanceId,source.portId),tp=port(target.instanceId,target.portId),sd=effectivePorts(components,s?.componentId).find(p=>p.id===sp?.definitionId),td=effectivePorts(components,t?.componentId).find(p=>p.id===tp?.definitionId);return !!(sp?.direction==='out'&&tp?.direction==='in'&&policyAllows(sd,t?.componentId,td)&&policyAllows(td,s?.componentId,sd));};
 const connections=(id,portId)=>snapshot.connections.filter(c=>[c.source,c.target].some(e=>e.instanceId===id&&(portId===undefined||e.portId===portId)));
 return freeze({version:2,workspace:snapshot,
  metamodel:{components:()=>components,component,ports:id=>component(id)?.ports||[],effectivePorts:id=>freeze(effectivePorts(components,id)),children:id=>components.filter(c=>c.parentId===id),parent:id=>component(component(id)?.parentId),dependencies:()=>snapshot.dependencies,incoming:id=>snapshot.dependencies.filter(d=>d.target===id),outgoing:id=>snapshot.dependencies.filter(d=>d.source===id)},
  instances:{all:()=>instances,get:instance,ofComponent:id=>instances.filter(i=>i.componentId===id),component:id=>component(instance(id)?.componentId),ports,port,definition:(id,pid)=>freeze(effectivePorts(components,instance(id)?.componentId).find(p=>p.id===port(id,pid)?.definitionId)),allowed,parameters:id=>instance(id)?.parameters,connections,connected:(id,portId)=>connections(id,portId).length>0,neighbors:id=>instances.filter(i=>snapshot.connections.some(c=>(c.source.instanceId===id&&c.target.instanceId===i.id)||(c.target.instanceId===id&&c.source.instanceId===i.id)))},
  connections:{all:()=>snapshot.connections,get:id=>snapshot.connections.find(c=>c.id===id),source:id=>{const c=snapshot.connections.find(c=>c.id===id);return c&&port(c.source.instanceId,c.source.portId);},target:id=>{const c=snapshot.connections.find(c=>c.id===id);return c&&port(c.target.instanceId,c.target.portId);}},
  report:issue=>report(issue),highlightPort:(nodeId,portId,color,message)=>report({severity:'info',nodeId,portId,highlightColor:color,message}),error:(message,nodeId,portId)=>report({severity:'error',message,nodeId,portId}),warning:(message,nodeId,portId)=>report({severity:'warning',message,nodeId,portId}),info:(message,nodeId,portId)=>report({severity:'info',message,nodeId,portId})
 });
}
const defaultSource=`for (const instance of api.instances.all()) {
  for (const port of api.instances.ports(instance.id)) {
    if (!api.instances.connected(instance.id, port.id)) {
      api.error(instance.name + ' → ' + port.name + ': port is not connected', instance.id, port.id);
    }
  }
}`;
const defaultRule=Object.freeze({id:'instance-port-connected',name:'Every instance port needs a connection',description:'A port is connected when it participates in at least one incoming or outgoing connection.',source:defaultSource,enabled:true});
function runRule(model,rule,callback){
 const issues=[];
 const report=value=>{if(!value||typeof value.message!=='string'||!value.message.trim())throw Error('A validation issue requires a non-empty message');if(issues.length>=1000)throw Error('Rule exceeded the 1,000 issue limit');const severity=value.severity||'error';if(!['error','warning','info'].includes(severity))throw Error('Severity must be error, warning, or info');const issue={ruleId:rule.id,ruleName:rule.name,severity,message:value.message.slice(0,4000)};for(const k of ['nodeId','portId','connectionId'])if(typeof value[k]==='string')issue[k]=value[k];if(value.blocksConnection===true)issue.blocksConnection=true;if(value.highlightColor!==undefined){if(!['red','orange','green','blue','purple'].includes(value.highlightColor))throw Error('Unsupported highlight color');issue.highlightColor=value.highlightColor;}issues.push(issue);};
 try{const result=callback(createAPI(model,report));if(result&&typeof result.then==='function')throw Error('Rules must be synchronous');if(result!==undefined){if(!Array.isArray(result))throw Error('Return an array of issues, or use api.report without returning a value');result.forEach(report);}}
 catch(e){issues.push({ruleId:rule.id,ruleName:rule.name,severity:'error',message:'Rule "'+rule.name+'" failed: '+String(e.message||e).slice(0,1000),scriptError:true});}
 return issues;
}
function defaultIssues(model){return runRule(model,defaultRule,api=>{for(const i of api.instances.all())for(const p of api.instances.ports(i.id))if(!api.instances.connected(i.id,p.id))api.error(i.name+' → '+p.name+': port is not connected',i.id,p.id);});}
const library={version:2,effectivePorts,policyAllows,createAPI,defaultRule,defaultIssues,runRule};root.ArchitexValidation=library;if(typeof module!=='undefined')module.exports=library;
})(typeof self!=='undefined'?self:globalThis);
