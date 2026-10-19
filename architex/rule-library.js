(function(root){
'use strict';
const FORMAT='architex-validation-rules',copy=x=>JSON.parse(JSON.stringify(x));
function validate(data){if(!data||data.format!==FORMAT||data.version!==1||typeof data.defaultRuleEnabled!=='boolean'||!Array.isArray(data.rules)||data.rules.length>20)throw Error('Expected an Architex validation-rule library, version 1 (maximum 20 custom rules)');const ids=new Set;for(const r of data.rules){if(!r||typeof r.id!=='string'||!r.id.trim()||r.id.length>200||r.id==='instance-port-connected'||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>120||typeof r.source!=='string'||r.source.length>50000||typeof r.enabled!=='boolean')throw Error('Invalid or duplicate validation rule');ids.add(r.id);}return {format:FORMAT,version:1,defaultRuleEnabled:data.defaultRuleEnabled,rules:data.rules.map(r=>({id:r.id,name:r.name,source:r.source,enabled:r.enabled}))};}
function bundle(rules,enabled){return validate({format:FORMAT,version:1,defaultRuleEnabled:enabled,rules:copy(rules)});}
function prepare(data,{activate=false,existing=[]}={}){const library=validate(data);library.rules=library.rules.map(r=>({...r,enabled:r.enabled&&(activate||existing.some(old=>old.id===r.id&&old.name===r.name&&old.source===r.source&&old.enabled))}));return library;}
const api={validate,bundle,prepare};root.ArchitexRuleLibrary=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
