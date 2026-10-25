/* Server changes are reviewed and explicitly approved before application. */
(() => {
  'use strict';
  const labels = {
    bind:'Listening address',port:'Port (0 selects an available port)',config:'Provider configuration file',search_config:'Google search configuration file',google_device_config:'Google device OAuth configuration file',skills_db:'Skill catalog database',skills_offline:'Keep skill catalog offline',allow_origin:'Additional trusted origins (one per line)',allow_workflow_command:'Allowed workflow executables (one per line)',workflow_cwd:'Workflow working directory',agent_workspace:'Coding-agent workspace',disable_agent:'Disable coding agent',agent_no_commands:'Disable coding-agent commands',agent_allow_command:'Allowed agent executables (one per line)',agent_navigation_dir:'Code navigation service directory',agent_embedding_dir:'Local embedding model directory'
  };
  const lists = new Set(['allow_origin','allow_workflow_command','agent_allow_command']);
  const bools = new Set(['skills_offline','disable_agent','agent_no_commands']);
  const button = document.createElement('button');
  button.textContent = 'Server settings';button.type = 'button';button.className = 'server-settings-open';
  document.querySelector('main header').append(button);
  const dialog = document.createElement('dialog');dialog.className = 'server-settings-dialog';dialog.setAttribute('aria-labelledby','server-settings-title');
  dialog.innerHTML = `<form><header><div><small>Relay administration</small><h2 id="server-settings-title">Server settings</h2></div><button type="button" data-close aria-label="Close server settings">×</button></header><p>Review changes, then explicitly approve them. Command permissions and additional origins can change live. Other settings take effect after a server restart.</p><p data-file></p><p data-pending role="status"></p><div data-fields class="server-settings-fields"></div><p>Blank optional paths use the server defaults. For agent commands, enable “Use default executables” to use installed Python, Node, npm and Git. Commands run with this server’s operating-system permissions.</p><label><input type="checkbox" data-default> Use default agent executables</label><section data-review hidden><h3>Review changes</h3><p>Live command changes require agent runs and workflow jobs to be paused or finished. Restart changes are saved; this action does not restart the server.</p><div data-changes></div><label><input type="checkbox" data-approval> I approve these exact changes, including any command permissions or trusted origins.</label><button type="button" data-apply class="primary" disabled>Approve and apply changes</button></section><p data-status role="status" aria-live="polite"></p><footer><button type="button" data-reload>Reload settings</button><button type="submit" class="primary">Review changes</button><button type="button" data-cancel>Cancel</button></footer></form>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let state, review, busy = false;
  async function request(data) {
    const response = await fetch('/api/admin/server-settings',{method:'POST',headers:{'Content-Type':'application/json','X-Architex-Admin':'1'},body:JSON.stringify(data)});
    const result = await response.json();if (!response.ok) throw new Error(result.error || 'Server settings request failed');return result;
  }
  function invalidate() {review = null;$('[data-review]').hidden = true;$('[data-approval]').checked = false;$('[data-apply]').disabled = true;}
  function render(next) {
    state = next;invalidate();$('[data-fields]').replaceChildren();
    $('[data-file]').textContent = `Private settings file: ${state.file} · Listening port: ${state.listeningPort}`;
    $('[data-pending]').textContent = state.restartRequired.length ? `Restart pending: ${state.restartRequired.map(k=>labels[k]).join(', ')}. Explicit startup flags override saved settings.` : 'No restart pending. Explicit startup flags override saved settings.';
    for (const [key,label] of Object.entries(labels)) {
      const wrapper = document.createElement('label');wrapper.textContent = `${label} · ${state.liveFields.includes(key)?'live':'restart'}`;
      const input = document.createElement(lists.has(key)?'textarea':'input');input.name = key;
      if (bools.has(key)) {input.type = 'checkbox';input.checked = state.settings[key];}
      else {if (key==='port') {input.type='number';input.min=0;input.max=65535;}input.value = lists.has(key) ? (state.settings[key] || []).join('\n') : (state.settings[key] ?? '');}
      wrapper.append(input);$('[data-fields]').append(wrapper);
    }
    $('[data-default]').checked = state.settings.agent_allow_command === null;
    syncDefaults();
  }
  function syncDefaults() {dialog.querySelector('[name="agent_allow_command"]').disabled = $('[data-default]').checked;}
  async function run(callback) {
    if (busy) return;busy=true;$('[data-status]').textContent='Working…';
    dialog.querySelectorAll('footer button').forEach(b=>b.disabled=true);$('[data-apply]').disabled=true;
    try {await callback();} catch(error) {$('[data-status]').textContent=error.message;}
    finally {busy=false;dialog.querySelectorAll('footer button').forEach(b=>b.disabled=false);$('[data-apply]').disabled=!review || !$('[data-approval]').checked;}
  }
  async function load() {render(await request({action:'read'}));$('[data-status]').textContent='Settings loaded.';}
  button.onclick=()=>{dialog.showModal();run(load);};
  $('[data-reload]').onclick=()=>run(load);
  $('[data-close]').onclick=$('[data-cancel]').onclick=()=>dialog.close();
  dialog.addEventListener('close',invalidate);
  $('[data-fields]').addEventListener('input',invalidate);
  $('[data-default]').onchange=()=>{invalidate();syncDefaults();};
  $('[data-approval]').onchange=()=>{$('[data-apply]').disabled=busy || !$('[data-approval]').checked;};
  $('form').onsubmit=event=>{event.preventDefault();run(async()=>{
    if (!state) throw new Error('Reload server settings first.');
    invalidate();const settings={};
    for(const key of Object.keys(labels)) {
      const input=dialog.querySelector(`[name="${key}"]`);
      settings[key]=bools.has(key)?input.checked:lists.has(key)?input.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean):key==='port'?Number(input.value):(input.value.trim() || null);
    }
    if($('[data-default]').checked) settings.agent_allow_command=null;
    review=await request({action:'review',revision:state.revision,settings});
    const changes=$('[data-changes]');changes.replaceChildren();
    for(const change of review.changes) {
      const row=document.createElement('p');const title=document.createElement('strong');title.textContent=`${labels[change.field]} (${change.mode==='live'?'apply now':'after restart'})`;
      const values=document.createElement('pre');values.textContent=`${JSON.stringify(change.before)}\n→ ${JSON.stringify(change.after)}`;row.append(title,values);changes.append(row);
    }
    if(!review.changes.length) {invalidate();$('[data-status]').textContent='No changes to apply.';return;}
    $('[data-review]').hidden=false;$('[data-status]').textContent='Review every change and check the approval box to continue.';$('[data-review]').scrollIntoView({block:'nearest'});
  });};
  $('[data-apply]').onclick=()=>run(async()=>{
    if(!review || !$('[data-approval]').checked) throw new Error('Review and explicitly approve the changes first.');
    const next=await request({action:'apply',revision:review.revision,ticket:review.ticket,approved:true});
    render(next);$('[data-status]').textContent=next.restartRequired.length?'Approved live settings applied. Other approved changes are saved for restart.':'Approved server settings applied and saved.';
  });
})();
