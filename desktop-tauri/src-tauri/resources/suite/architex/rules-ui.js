'use strict';
let userRules=[],editingRule=ArchitexValidation.defaultRule.id,validationJob=null;
const ruleStorageKey='architex-validation-rules-v1';
let defaultRuleEnabled=true;try{defaultRuleEnabled=localStorage.getItem('architex-validation-default-enabled')!=='false';}catch{}
window.builtinRuleEnabled=()=>defaultRuleEnabled;
try{const stored=JSON.parse(localStorage.getItem(ruleStorageKey)||'[]');if(!Array.isArray(stored)||stored.length>20||stored.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||typeof r.source!=='string'||r.source.length>50000||typeof r.enabled!=='boolean')||new Set(stored.map(r=>r.id)).size!==stored.length||stored.some(r=>r.id===ArchitexValidation.defaultRule.id))throw Error('Invalid rule library');userRules=stored;}catch(e){toast('Could not restore the rule library: '+e.message);}
const exampleRule=`// Example: validate both the metamodel and its instances.
for (const component of api.metamodel.components()) {
  if (!component.description.trim()) {
    api.warning(component.name + ': add a description', component.id);
  }
}
for (const instance of api.instances.all()) {
  const type = api.instances.component(instance.id);
  for (const key of Object.keys(type?.parameters || {})) {
    if (!Object.hasOwn(instance.parameters, key)) {
      api.error(instance.name + ': missing parameter ' + key, instance.id);
    }
  }
}`;
function allRules(){return [{...ArchitexValidation.defaultRule,enabled:defaultRuleEnabled},...userRules];}
function ruleKey(m){return JSON.stringify([m,userRules,defaultRuleEnabled]);}
function runWorker(m,rule){return new Promise(resolve=>{
 let worker,timer,done=false;
 const finish=issues=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();resolve(issues);};
 const fail=message=>finish([{ruleId:rule.id,ruleName:rule.name,severity:'error',message:'Rule "'+rule.name+'" failed: '+message,scriptError:true}]);
 try{worker=new Worker('validation-worker.js');validationJob?.cancel.push(()=>finish([]));worker.onmessage=e=>{if(!Array.isArray(e.data?.issues))return fail('invalid worker response');finish(e.data.issues);};worker.onerror=e=>{e.preventDefault();fail(e.message||'worker unavailable');};timer=setTimeout(()=>fail('execution exceeded 1.5 seconds'),1500);worker.postMessage({model:m,rule});}catch(e){fail(e.message);}
});}
window.scheduleRuleValidation=m=>{
 const key=ruleKey(m);if(validationJob?.key===key)return validationJob.promise;
 validationJob?.cancel.forEach(cancel=>cancel());
 const job={key,cancel:[],status:'running',issues:[],promise:null};validationJob=job;
 const rules=userRules.filter(r=>r.enabled);
 // A separate worker and timeout per rule keep failed rules from suppressing others.
 job.promise=Promise.all(rules.map(r=>runWorker(A.clone(m),r))).then(results=>{job.issues=results.flat();job.status='complete';if(validationJob===job)renderValidation();return job.issues;});
 return job.promise;
};
window.currentScriptIssues=m=>validationJob?.key===ruleKey(m)?validationJob.issues:[];
window.scriptValidationPending=()=>validationJob?.status==='running';
window.ensureScriptValidation=m=>window.scheduleRuleValidation(m);
function persistRules(){try{localStorage.setItem(ruleStorageKey,JSON.stringify(userRules));localStorage.setItem('architex-validation-default-enabled',String(defaultRuleEnabled));return true;}catch(e){$('#ruleError').textContent='Could not save rules locally. Export the script to keep a copy.';return false;}}
function renderRuleEditor(){const rule=allRules().find(r=>r.id===editingRule)||ArchitexValidation.defaultRule;editingRule=rule.id;const builtin=rule.id===ArchitexValidation.defaultRule.id;
 $('#ruleList').innerHTML=allRules().map(r=>`<div class="rule-entry"><button type="button" data-rule="${esc(r.id)}" class="${r.id===editingRule?'selected-rule':''}"><b>${esc(r.name)}</b><span>${r.id===ArchitexValidation.defaultRule.id?'Built-in · ':''}${r.enabled?'Enabled':'Disabled'}</span></button><label title="Activate or deactivate this rule"><input type="checkbox" data-toggle-rule="${esc(r.id)}" aria-label="Enable ${esc(r.name)}" ${r.enabled?'checked':''}></label></div>`).join('');
 $('#ruleName').value=rule.name;$('#ruleName').readOnly=builtin;$('#ruleSource').value=rule.source;$('#ruleSource').readOnly=builtin;$('#ruleEnabled').checked=rule.enabled;$('#ruleEnabled').disabled=false;$('#deleteRule').disabled=builtin;$('#saveRule').disabled=false;$('#ruleError').textContent='';
}
$('#validationRules').onclick=()=>{renderRuleEditor();$('#rulesDialog').showModal();};$('#closeRules').onclick=()=>$('#rulesDialog').close();
$('#ruleList').onchange=e=>{const id=e.target.dataset.toggleRule;if(!id)return;checkpoint();if(id===ArchitexValidation.defaultRule.id)defaultRuleEnabled=e.target.checked;else userRules.find(r=>r.id===id).enabled=e.target.checked;persistRules();renderRuleEditor();renderValidation();};
$('#ruleList').onclick=e=>{const b=e.target.closest('[data-rule]');if(b){editingRule=b.dataset.rule;renderRuleEditor();}};
$('#newRule').onclick=()=>{if(userRules.length>=20)return toast('The library supports up to 20 custom rules.');checkpoint();const r={id:uid('rule'),name:'New architecture rule',source:exampleRule,enabled:false};userRules.push(r);editingRule=r.id;persistRules();renderRuleEditor();};
$('#saveRule').onclick=async()=>{if(editingRule===ArchitexValidation.defaultRule.id){checkpoint();defaultRuleEnabled=$('#ruleEnabled').checked;persistRules();renderRuleEditor();renderValidation();toast('Default rule '+(defaultRuleEnabled?'enabled':'disabled'));return;}const r=userRules.find(r=>r.id===editingRule);if(!r)return;const name=$('#ruleName').value.trim(),source=$('#ruleSource').value;if(!name||source.length>50000){$('#ruleError').textContent='Enter a name and keep the script below 50,000 characters.';return;}checkpoint();r.name=name;r.source=source;r.enabled=$('#ruleEnabled').checked;const persisted=persistRules();const issues=await window.ensureScriptValidation(model);renderValidation();if(persisted){renderRuleEditor();$('#ruleError').textContent=issues.filter(i=>i.ruleId===r.id&&i.scriptError).map(i=>i.message).join('\n');toast('Rule saved'+(r.enabled?' and executed':' (disabled)'));}};
$('#deleteRule').onclick=()=>{checkpoint();userRules=userRules.filter(r=>r.id!==editingRule);persistRules();editingRule=ArchitexValidation.defaultRule.id;renderRuleEditor();renderValidation();};
$('#exportRule').onclick=()=>{const r=allRules().find(r=>r.id===editingRule);const source=r.id===ArchitexValidation.defaultRule.id?r.source:$('#ruleSource').value;download('architex-'+r.id+'.js',source,'text/javascript');};
$('#importRules').onclick=()=>$('#ruleFile').click();
$('#ruleFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>50000)throw Error('Script exceeds 50 KB');if(userRules.length>=20)throw Error('Maximum of 20 custom rules');const source=await file.text(),r={id:uid('rule'),name:file.name.replace(/\.js$/i,'').slice(0,120),source,enabled:false};checkpoint();userRules.push(r);editingRule=r.id;persistRules();renderRuleEditor();toast('Script imported disabled. Review it before enabling and running.');}catch(err){$('#ruleError').textContent=err.message;}finally{e.target.value='';}};
$('#downloadAPI').onclick=()=>download('architex-validation-api-agent.txt',window.ArchitexAgentGuide,'text/plain;charset=utf-8');
function exportRuleLibrary(){return ArchitexRuleLibrary.bundle(userRules,defaultRuleEnabled);}
function replaceRuleLibrary(data,{activate=false,existing=[]}={}){const next=ArchitexRuleLibrary.prepare(data,{activate,existing});userRules=next.rules;defaultRuleEnabled=next.defaultRuleEnabled;persistRules();editingRule=ArchitexValidation.defaultRule.id;if($('#rulesDialog').open)renderRuleEditor();renderValidation();return exportRuleLibrary();}
$('#exportRuleLibrary').onclick=()=>download('architex-validation-rules.json',JSON.stringify(exportRuleLibrary(),null,2),'application/json');
$('#importRuleLibrary').onclick=()=>$('#ruleLibraryFile').click();
$('#ruleLibraryFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error('Rule library exceeds 8 MB');const data=ArchitexRuleLibrary.validate(JSON.parse(await file.text()));checkpoint();replaceRuleLibrary(data,{activate:$('#activateImportedRules').checked});toast('Validation-rule library imported');}catch(err){$('#ruleError').textContent=err.message;}finally{e.target.value='';}};
$('#loadRuleExample').onclick=()=>{const sample=window.ArchitexRuleExamples.find(r=>r.id===$('#ruleExample').value);if(!sample)return;if(userRules.some(r=>r.id===sample.id)){editingRule=sample.id;renderRuleEditor();return toast('Example is already loaded');}if(userRules.length>=20)return toast('Maximum of 20 custom rules');checkpoint();userRules.push(A.clone(sample));editingRule=sample.id;persistRules();renderRuleEditor();renderValidation();toast('Example loaded disabled. Review and enable it to use it.');};
async function checkCandidateRules(workspace,library=exportRuleLibrary()){const results=await Promise.all(library.rules.filter(r=>r.enabled).map(r=>runWorker(A.clone(workspace),r)));return results.flat();}
async function checkConnectionRules(workspace,connection){const candidate=A.clone(workspace);candidate.connections.push(connection);const issues=await checkCandidateRules(candidate);return issues.filter(i=>i.scriptError||(i.blocksConnection===true&&i.connectionId===connection.id));}

window.ArchitexScripting={version:2,checkCandidate:checkCandidateRules,checkConnection:checkConnectionRules,createAPI:ArchitexValidation.createAPI,listRules:()=>A.clone(allRules()),exportLibrary:exportRuleLibrary,replaceLibrary:replaceRuleLibrary,validate:async()=>{const snapshot=A.clone(model);const custom=await window.ensureScriptValidation(snapshot);return [...baseValidationIssues(snapshot),...custom];}};

renderValidation();
