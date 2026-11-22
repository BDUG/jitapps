(() => {
 'use strict';
 const api=acquireVsCodeApi(),$=id=>document.getElementById(id);
 let running=false,preparing=false,session='',count=0,workspaceKey='',pendingGoal=null,permsInitialized=false,slashCommands=[],mentionSuggestions=[],menuItems=[],menuIndex=0,menuToken=null;
 const saved=api.getState?.()||{},drafts=saved.drafts&&typeof saved.drafts==='object'&&!Array.isArray(saved.drafts)?saved.drafts:{};
 const seenDrafts=new Set(Array.isArray(saved.seenDrafts)?saved.seenDrafts:[]);

 function post(command,extra={}){api.postMessage({command,...extra});}
 function saveDraft(){if(!workspaceKey)return;drafts[workspaceKey]=$('goal').value;api.setState?.({drafts,seenDrafts:[...seenDrafts]});post('saveDraft',{workspaceKey,text:$('goal').value});}

 function hideMenu(){menuItems=[];menuIndex=0;menuToken=null;const m=$('composer-menu');if(m){m.hidden=true;m.replaceChildren();}}
 function applyMenuItem(item){if(!item||!menuToken)return;const g=$('goal'),v=g.value;g.value=v.slice(0,menuToken.start)+item.insert+v.slice(menuToken.end);const pos=menuToken.start+item.insert.length;g.setSelectionRange?.(pos,pos);saveDraft();hideMenu();g.focus();}
 function renderMenu(){const m=$('composer-menu');if(!m)return;if(!menuItems.length){m.hidden=true;m.replaceChildren();return;}m.replaceChildren();menuItems.forEach((item,idx)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(idx===menuIndex));const lbl=document.createElement('span');lbl.textContent=item.label;const desc=document.createElement('span');desc.className='menu-desc';desc.textContent=item.description||'';b.append(lbl,desc);b.onclick=()=>applyMenuItem(item);m.append(b);});m.hidden=false;}
 function updateMenu(){const g=$('goal'),pos=g.selectionStart??g.value.length,before=g.value.slice(0,pos);const slash=/^\/([a-z0-9_-]*)$/i.exec(before);if(slash){const q=slash[1].toLowerCase();menuToken={start:0,end:pos};menuItems=slashCommands.filter(c=>c.name.startsWith(q)).map(c=>({label:'/'+c.name,description:c.description,insert:'/'+c.name+' '}));menuIndex=0;renderMenu();return;}const at=/(?:^|\s)(@[a-z0-9_./:-]*)$/i.exec(before);if(at){const q=at[1].toLowerCase(),start=pos-at[1].length;menuToken={start,end:pos};menuItems=mentionSuggestions.filter(m=>m.token.toLowerCase().includes(q)).slice(0,12).map(m=>({label:m.token,description:m.description,insert:m.token+(m.token.endsWith(':')?'':' ')}));menuIndex=0;renderMenu();return;}hideMenu();}

 function add(kind,text){
  const chat=$('chat'),follow=chat.scrollHeight-chat.scrollTop-chat.clientHeight<48;
  const card=document.createElement('article');card.className=kind;
  const title=document.createElement('strong');
  title.textContent={user:'You',plan:'Plan',result:'Observation',error:'Error',status:'Status',info:'Info'}[kind]||kind;
  const body=document.createElement('pre');body.textContent=text;
  const copy=document.createElement('button');copy.type='button';copy.className='copy-btn';copy.textContent='Copy';copy.title='Copy message';copy.setAttribute('aria-label','Copy message');
  copy.onclick=async e=>{e?.stopPropagation?.();try{if(navigator?.clipboard?.writeText)await navigator.clipboard.writeText(text);else post('copyText',{text});}catch{post('copyText',{text});}copy.textContent='Copied';setTimeout(()=>{copy.textContent='Copy';},1200);};
  card.append(title,copy,body);
  if(kind==='error'){card.title='Click to resolve this failure';card.onclick=e=>{if(e?.target?.tagName==='SUMMARY')return;post('resolveFailure',{text});};}
  chat.append(card);
  if(++count>250){chat.firstElementChild?.remove();count--;}
  if(follow)chat.scrollTop=chat.scrollHeight;
  return card;
 }

 function summarizeObservation(o){
  const v=o.result||{},failed=o.ok===false||o.checks?.passed===false||v.cancelled||v.timedOut||Number.isInteger(v.exitCode)&&v.exitCode!==0;
  const label=(o.tool||'Tool')+' · '+(failed?'needs attention':'observed')+(Number.isInteger(v.exitCode)?' · exit '+v.exitCode:'')+(v.timedOut?' · timed out':'')+(v.cancelled?' · cancelled':'');
  return {failed,label};
 }

 function event(value,replay=false){
  switch(value.kind){
   case'user':
    add('user',value.text);
    if(!replay&&pendingGoal!==null){if($('goal').value.trim()===pendingGoal){$('goal').value='';saveDraft();}pendingGoal=null;}
    break;
   case'plan':add('plan',value.plan+(value.action?'\n→ '+value.action:''));break;
   case'result':{
    const r=value.result;
    if(r.observation){
     const o=r.observation,{failed,label}=summarizeObservation(o);
     const card=add(failed?'error':'result',label);
     const details=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');
     summary.textContent='Inspect result';let loaded=false;
     details.ontoggle=()=>{if(details.open&&!loaded){raw.textContent=JSON.stringify(o,null,2);loaded=true;}};
     details.append(summary,raw);card.append(details);
    }else if(r.error){add('error',r.error);$('status').textContent=r.error;$('status').classList?.add('has-error');$('status').title='Click to resolve this failure';}
    else if(r.question){
     const card=add('result',r.question+'\nEnter your answer below and choose Resume.');
     const replies=document.createElement('div');replies.className='quick-replies';
     for(const answer of ['Yes, proceed','Use recommended option','No, skip','Explain options']){
      const btn=document.createElement('button');btn.type='button';btn.className='quick-reply';btn.textContent=answer;
      btn.onclick=()=>{const g=$('goal');g.value=answer;saveDraft();if(!running&&!preparing&&session&&!$('resume').disabled)run(true);else g.focus();};
      replies.append(btn);
     }
     card.append(replies);
    }
    else if(r.summary){const card=add('result',r.summary);if(r.executionMode==='plan')card.children[0].textContent='Implementation plan · not applied';}
    break;
   }
   case'error':add('error',value.text);$('status').textContent=value.text;$('status').classList?.add('has-error');$('status').title='Click to resolve this failure';break;
   case'info':case'status':add(value.kind,value.text);$('status').textContent=value.text;$('status').classList?.remove('has-error');$('status').title='';break;
   case'providerRetry':add('info',value.text);$('status').textContent='Model retry '+value.attempt+'/'+value.total+' · waiting '+Math.ceil(value.delayMs/1000)+'s';break;
   case'runDeadline':$('status').textContent='Run time limit reached · stopping';add('info',value.text);break;
   case'verificationRequired':add('info',value.message);$('status').textContent='Paused: configured verification is incomplete.';break;
   case'loopGuard':add('info',value.message);$('status').textContent='Paused: no progress.';break;
   case'pauseRequested':add('info',value.text);$('status').textContent='Pausing after the current action…';break;
   case'step':$('status').textContent='Planning step '+value.step;break;
  }
 }

 function run(resume){
  if(running||preparing)return;
  const goal=$('goal').value.trim();
  if(!resume&&!goal){$('goal').focus();return;}
  pendingGoal=goal;saveDraft();preparing=true;$('start').disabled=true;$('resume').disabled=true;$('spinner').hidden=false;
  post('run',{goal,resume,session,edits:!!$('edits').checked,commands:!!$('commands').checked});
 }

 $('goal').oninput=()=>{saveDraft();updateMenu();};
 $('goal').onkeydown=e=>{
  if(menuItems.length&&!e.isComposing){
   if(e.key==='ArrowDown'){e.preventDefault();menuIndex=(menuIndex+1)%menuItems.length;renderMenu();return;}
   if(e.key==='ArrowUp'){e.preventDefault();menuIndex=(menuIndex-1+menuItems.length)%menuItems.length;renderMenu();return;}
   if(e.key==='Tab'||(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey)){e.preventDefault();applyMenuItem(menuItems[menuIndex]);return;}
   if(e.key==='Escape'){e.preventDefault();hideMenu();return;}
  }
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();hideMenu();run(!!session&&!$('resume').disabled);return;}
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&/^\/(help|status|new|clear|snapshots|changes|export|settings|tools|skills|agents)\s*$/i.test($('goal').value)){e.preventDefault();hideMenu();run(false);}
 };
 $('latest').onclick=()=>{const chat=$('chat');chat.scrollTop=chat.scrollHeight;};
 $('status').onclick=()=>{if($('status').classList?.contains('has-error'))post('resolveFailure',{text:$('status').textContent});};
 if($('sessions-btn'))$('sessions-btn').onclick=()=>{const d=$('sessions-drawer');if(!d)return;if($('snapshots-drawer'))$('snapshots-drawer').hidden=true;d.hidden=!d.hidden;if(!d.hidden)post('listSessions');};
 if($('snapshots-btn'))$('snapshots-btn').onclick=()=>{const d=$('snapshots-drawer');if(!d)return;if($('sessions-drawer'))$('sessions-drawer').hidden=true;d.hidden=!d.hidden;if(!d.hidden)post('listSnapshots');};
 if($('create-snapshot'))$('create-snapshot').onclick=()=>post('createSnapshot');
 function renderSnapshots(items){
  const list=$('snapshots-list');if(!list)return;
  list.replaceChildren();
  if(!items?.length){const empty=document.createElement('p');empty.className='session-meta';empty.textContent='No snapshots yet.';list.append(empty);return;}
  for(const item of items){
   const row=document.createElement('div');row.className='snapshot-row';
   const info=document.createElement('div');info.className='snapshot-info';
   const title=document.createElement('div');title.className='session-title';title.textContent=item.label||'Snapshot';
   const meta=document.createElement('div');meta.className='session-meta';meta.textContent=(item.fileCount??0)+' files'+(item.createdAt?' · '+new Date(item.createdAt).toLocaleTimeString():'');
   info.append(title,meta);
   const acts=document.createElement('div');acts.className='snapshot-actions';
   const rb=document.createElement('button');rb.type='button';rb.className='mini-btn';rb.textContent='Rollback';rb.onclick=()=>{if($('snapshots-drawer'))$('snapshots-drawer').hidden=true;post('rollbackSnapshot',{id:item.id});};
   const del=document.createElement('button');del.type='button';del.className='mini-btn';del.textContent='Delete';del.onclick=()=>post('deleteSnapshot',{id:item.id});
   acts.append(rb,del);row.append(info,acts);list.append(row);
  }
 }
 function renderSessions(items){
  const list=$('sessions-list');if(!list)return;
  list.replaceChildren();
  if(!items?.length){const empty=document.createElement('p');empty.className='session-meta';empty.textContent='No saved sessions yet.';list.append(empty);return;}
  for(const item of items){
   const btn=document.createElement('button');btn.type='button';btn.className='session-item'+(item.id===session?' active':'');
   if(item.id===session)btn.setAttribute('aria-current','true');
   const title=document.createElement('span');title.className='session-title';title.textContent=item.label||'Untitled session';
   const meta=document.createElement('span');meta.className='session-meta';meta.textContent=item.description||'';
   btn.append(title,meta);
   btn.onclick=()=>{if($('sessions-drawer'))$('sessions-drawer').hidden=true;post('selectSession',{id:item.id});};
   list.append(btn);
  }
 }
 const splitter=$('splitter');
 if(splitter&&typeof window.addEventListener==='function'){
  let dragStartY=0,startHeight=0;
  const onMove=e=>{
   const g=$('goal'),next=Math.max(44,Math.min(Math.round((window.innerHeight||600)*0.6),startHeight+(dragStartY-e.clientY)));
   g.style.height=next+'px';
  };
  const onUp=()=>{
   splitter.classList?.remove('dragging');
   window.removeEventListener?.('pointermove',onMove);
   window.removeEventListener?.('pointerup',onUp);
  };
  splitter.onpointerdown=e=>{
   dragStartY=e.clientY;startHeight=$('goal').offsetHeight||44;
   splitter.classList?.add('dragging');
   window.addEventListener?.('pointermove',onMove);
   window.addEventListener?.('pointerup',onUp);
  };
 }
 $('form').onsubmit=e=>{e.preventDefault();run(false);};
 $('resume').onclick=()=>run(true);
 $('stop').onclick=()=>post('stop');
 $('pause').onclick=()=>post('pause');
 for(const b of document.querySelectorAll('[data-command]'))b.onclick=()=>post(b.dataset.command);

 window.addEventListener('message',({data})=>{
  if(!data||typeof data!=='object')return;
  if(data.kind==='state'){
   if(Array.isArray(data.slashCommands))slashCommands=data.slashCommands;
   if(Array.isArray(data.mentionSuggestions))mentionSuggestions=data.mentionSuggestions;
   for(const [key,text]of Object.entries(data.savedDrafts||{}))if(typeof text==='string'&&!Object.prototype.hasOwnProperty.call(drafts,key))drafts[key]=text;
   running=!!data.running;preparing=!!data.preparing;session=data.session||'';
   if(!permsInitialized){if(typeof data.allowEdits==='boolean')$('edits').checked=data.allowEdits;if(typeof data.allowCommands==='boolean')$('commands').checked=data.allowCommands;permsInitialized=true;}
   $('edits').disabled=running||preparing;$('commands').disabled=running||preparing;$('attach').disabled=running||preparing;if($('new-session'))$('new-session').disabled=running||preparing;if($('sessions-btn'))$('sessions-btn').disabled=running||preparing;if($('snapshots-btn'))$('snapshots-btn').disabled=running||preparing;if($('create-snapshot'))$('create-snapshot').disabled=running||preparing;if($('reset-all'))$('reset-all').disabled=running||preparing;
   $('spinner').hidden=!(running||preparing);
   const refs=$('references');
   if(refs){refs.replaceChildren();for(const r of data.attachments||[]){const chip=document.createElement('span');chip.className='reference';const lbl=document.createElement('span');lbl.textContent=r.name+' · '+(r.mimeType?r.kind+' · '+r.bytes+'B':r.characters+' chars');const rm=document.createElement('button');rm.type='button';rm.textContent='×';rm.setAttribute('aria-label','Remove '+r.name);rm.disabled=running||preparing;rm.onclick=()=>post('removeAttachment',{name:r.name});chip.append(lbl,rm);refs.append(chip);}}
   const nextKey=typeof data.workspaceKey==='string'?data.workspaceKey:'';
   if(nextKey!==workspaceKey){const preserveInitial=!workspaceKey&&$('goal').value.trim();workspaceKey=nextKey;if(!preserveInitial)$('goal').value=typeof drafts[workspaceKey]==='string'?drafts[workspaceKey]:'';saveDraft();}
   for(const draft of data.pendingDrafts||[]){if(draft.workspaceKey!==workspaceKey||typeof draft.id!=='string'||typeof draft.text!=='string')continue;if(!seenDrafts.has(draft.id)){seenDrafts.add(draft.id);$('goal').value+=($('goal').value.trim()?'\n\n':'')+draft.text;saveDraft();}post('ackDraft',{id:draft.id});}
   $('workspace').textContent=data.workspace?data.workspace+(session?' · '+session:''):'Open a workspace folder to start.';
   $('start').disabled=running||preparing;$('resume').disabled=running||preparing||!session||data.sessionStatus==='complete';
   $('stop').disabled=!running;$('pause').disabled=!running||!!data.pauseRequested;$('pause').textContent=data.pauseRequested?'Pausing…':'Pause';
   if(data.trace){$('chat').replaceChildren();count=0;for(const item of data.trace)event(item,true);}
   return;
  }
  if(data.kind==='sessionsList'){renderSessions(data.sessions);return;}
  if(data.kind==='snapshotsList'){renderSnapshots(data.snapshots);return;}
  if(data.kind==='reset'){count=0;$('chat').replaceChildren();return;}
  event(data);
 });
 post('ready');
})();
