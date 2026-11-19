(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (tag, text, attrs = {}) => {
    const n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const status = (msg, err = false) => {
    const s = $('#mb-status');
    s.textContent = msg;
    s.style.color = err ? '#8b1e3f' : '#626a73';
  };
  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', '', { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function api(body) {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Architex-Request': '1' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || 'Agent runtime error ' + res.status);
    return data;
  }

  let activeTab = 'sessions';
  let selectedSessionId = null;
  let selectedMemId = null;
  let archSubtab = 'structmem';

  document.querySelectorAll('.mb-tabs button').forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.mb-tabs button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      render();
    };
  });

  // Global Export / Import
  $('#mb-export').onclick = async () => {
    try {
      if (activeTab === 'memory') {
        download('agent-memory-bundle.json', await api({ op: 'agent_memory', action: 'export', includeScratch: true }));
      } else if (activeTab === 'browser') {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (/^(suite-agent|suite-ai|agent-|codeix-agent)/.test(k)) out[k] = localStorage.getItem(k);
        }
        download('browser-chat-agent-backup.json', { format: 'tlal-browser-memory-v1', keys: out });
      } else {
        const [mem, suite] = await Promise.all([
          api({ op: 'agent_memory', action: 'export', includeScratch: true }),
          api({ op: 'memory_suite', action: 'stats' }),
        ]);
        download('tlal-agent-data-snapshot.json', { memory: mem, architectures: suite });
      }
      status('Exported JSON bundle');
    } catch (e) { status(e.message, true); }
  };

  $('#mb-import').onclick = () => $('#mb-file').click();
  $('#mb-file').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const payload = JSON.parse(await f.text());
      if (payload?.format === 'tlal-browser-memory-v1' && payload.keys) {
        for (const [k, v] of Object.entries(payload.keys)) localStorage.setItem(k, String(v));
        status('Imported browser keys');
      } else {
        const res = await api({ op: 'agent_memory', action: 'import', payload });
        status(`Imported ${res.imported}, merged ${res.merged}`);
      }
      render();
    } catch (err) { status(err.message, true); }
    e.target.value = '';
  };

  async function renderInspectorStats() {
    const ins = $('#mb-inspector');
    try {
      const [memStats, suiteStats] = await Promise.all([
        api({ op: 'agent_memory', action: 'stats' }),
        api({ op: 'memory_suite', action: 'stats' }),
      ]);
      ins.innerHTML = `
        <details open><summary>MemoryManager Stats</summary><pre>${JSON.stringify(memStats, null, 2)}</pre></details>
        <details open><summary>Architectures Stats</summary><pre>${JSON.stringify(suiteStats, null, 2)}</pre></details>
      `;
    } catch {
      ins.innerHTML = `<p>Connect to the local Python relay server (<code>server/server.py</code>) to inspect runtime databases. Browser Storage tab works offline.</p>`;
    }
  }

  // ---------------------------------------------------------------- Sessions
  async function renderSessions() {
    const side = $('#mb-sidebar'), detail = $('#mb-detail');
    side.innerHTML = `<div class="mb-row"><input id="s-q" class="mb-fill" type="search" placeholder="Filter sessions…"><button id="s-refresh" type="button">↻</button></div><div class="mb-list" id="s-list"></div>`;
    detail.innerHTML = `<p>Select a coding agent session to edit its goal, memory persistence, per-session skills, or scratchpad.</p>`;

    async function loadList() {
      const data = await api({ op: 'run_history', query: $('#s-q').value.trim(), limit: 50 });
      const list = $('#s-list');
      list.replaceChildren();
      for (const run of data.runs || []) {
        const b = el('button', run.goal.slice(0, 70));
        b.type = 'button';
        if (run.id === selectedSessionId) b.setAttribute('aria-current', 'true');
        b.append(el('small', `${run.status} · ${run.outcome || 'active'} · ${run.toolCalls} calls`));
        b.onclick = () => { selectedSessionId = run.id; loadList(); loadDetail(run.id); };
        list.append(b);
      }
      if (!data.runs?.length) list.textContent = 'No saved coding-agent sessions.';
    }

    async function loadDetail(id) {
      const s = await api({ op: 'session', session: id });
      const scratch = await api({ op: 'scratchpad', session: id, action: 'list' }).catch(() => ({ keys: [] }));
      detail.innerHTML = `
        <div class="mb-row"><strong>Session ${s.id}</strong><button type="button" id="s-save" class="primary">Save changes</button><button type="button" id="s-del">Delete session</button></div>
        <label>Goal<textarea id="s-goal" rows="3"></textarea></label>
        <label style="display:flex;align-items:center;gap:8px"><input id="s-rem" type="checkbox" style="width:auto;margin:0">Remember this session in long-term memory</label>
        <label>Per-session skills JSON<textarea id="s-skills" rows="6" spellcheck="false"></textarea></label>
        <details open><summary>Session Scratchpad (${(scratch.keys || []).length} keys)</summary>
          <div class="mb-row"><input id="sc-key" placeholder="key"><input id="sc-val" class="mb-fill" placeholder="value"><button type="button" id="sc-set">Set key</button></div>
          <pre id="sc-list"></pre>
        </details>
        <details><summary>Events (${s.events.length})</summary><pre id="s-events"></pre></details>
      `;
      $('#s-goal').value = s.goal || '';
      $('#s-rem').checked = s.rememberSessions !== false;
      $('#s-skills').value = JSON.stringify(s.sessionSkills || {}, null, 2);
      $('#sc-list').textContent = JSON.stringify(scratch.keys || [], null, 2);
      $('#s-events').textContent = JSON.stringify(s.events.slice(-25), null, 2);

      $('#sc-set').onclick = async () => {
        try {
          await api({ op: 'scratchpad', session: s.id, action: 'set', key: $('#sc-key').value.trim(), value: $('#sc-val').value });
          status('Updated scratchpad key');
          loadDetail(s.id);
        } catch (e) { status(e.message, true); }
      };
      $('#s-save').onclick = async () => {
        try {
          await api({ op: 'session_update', session: s.id, goal: $('#s-goal').value, rememberSessions: $('#s-rem').checked, sessionSkills: JSON.parse($('#s-skills').value || '{}') });
          status('Saved session ' + s.id.slice(0, 10));
          loadList();
        } catch (e) { status(e.message, true); }
      };
      $('#s-del').onclick = async () => {
        if (!confirm('Delete session ' + s.id + '?')) return;
        await api({ op: 'session_delete', session: s.id });
        selectedSessionId = null;
        status('Deleted session');
        renderSessions();
      };
    }

    $('#s-refresh').onclick = () => loadList().catch(e => status(e.message, true));
    $('#s-q').oninput = () => loadList().catch(e => status(e.message, true));
    await loadList();
    if (selectedSessionId) await loadDetail(selectedSessionId);
  }

  // --------------------------------------------------------- Long-Term Memory
  async function renderMemory() {
    const side = $('#mb-sidebar'), detail = $('#mb-detail');
    side.innerHTML = `
      <div class="mb-row"><input id="m-q" class="mb-fill" type="search" placeholder="Search memories…"><button id="m-search" type="button">Go</button></div>
      <div class="mb-row"><select id="m-kind"><option value="">All kinds</option><option>fact</option><option>lesson</option><option>episode</option><option>preference</option><option>procedure</option><option>note</option></select><button id="m-new" type="button">+ New</button><button id="m-cons" type="button">Consolidate</button></div>
      <div class="mb-list" id="m-list"></div>
    `;
    detail.innerHTML = `<p>Select a memory item or click <strong>+ New</strong> to create one.</p>`;

    async function loadList() {
      const q = $('#m-q').value.trim(), kind = $('#m-kind').value;
      const data = q
        ? await api({ op: 'agent_memory', action: 'recall', query: q, ...(kind ? { kinds: [kind] } : {}), limit: 40 })
        : await api({ op: 'agent_memory', action: 'list', ...(kind ? { kind } : {}), limit: 50 });
      const list = $('#m-list');
      list.replaceChildren();
      for (const item of data.items || []) {
        const b = el('button', `${item.pinned ? '📌 ' : ''}[${item.kind}] ${item.title || item.id}`);
        b.type = 'button';
        if (item.id === selectedMemId) b.setAttribute('aria-current', 'true');
        b.append(el('small', `imp ${item.importance} · ret ${item.retention} · ${(item.tags || []).join(', ')}`));
        b.onclick = () => { selectedMemId = item.id; loadList(); loadEditor(item.id); };
        list.append(b);
      }
      if (!data.items?.length) list.textContent = 'No memories found.';
    }

    async function loadEditor(id = null) {
      const item = id ? await api({ op: 'agent_memory', action: 'read', id }) : { id: null, kind: 'fact', title: '', content: '', tags: [], importance: 0.7, confidence: 0.85, pinned: false };
      detail.innerHTML = `
        <div class="mb-row"><strong>${item.id ? 'Memory ' + item.id : 'New Memory'}</strong><button type="button" id="m-save" class="primary">Save</button>${item.id ? '<button type="button" id="m-del">Forget</button>' : ''}</div>
        <div class="mb-row">
          <label class="mb-fill">Kind<select id="me-kind"><option>fact</option><option>lesson</option><option>episode</option><option>preference</option><option>procedure</option><option>note</option></select></label>
          <label class="mb-fill">Importance<input id="me-imp" type="number" step="0.05" min="0" max="1"></label>
          <label class="mb-fill">Confidence<input id="me-conf" type="number" step="0.05" min="0" max="1"></label>
        </div>
        <label>Title<input id="me-title" maxlength="200"></label>
        <label>Tags (comma-separated)<input id="me-tags"></label>
        <label>Content<textarea id="me-content" rows="7"></textarea></label>
        <label style="display:flex;align-items:center;gap:8px"><input id="me-pin" type="checkbox" style="width:auto;margin:0">Pinned (immune to forgetting &amp; pruning)</label>
      `;
      $('#me-kind').value = item.kind;
      $('#me-imp').value = item.importance;
      $('#me-conf').value = item.confidence;
      $('#me-title').value = item.title || '';
      $('#me-tags').value = (item.tags || []).join(', ');
      $('#me-content').value = item.content || '';
      $('#me-pin').checked = !!item.pinned;

      $('#m-save').onclick = async () => {
        try {
          const tags = $('#me-tags').value.split(',').map(s => s.trim()).filter(Boolean);
          const res = await api({
            op: 'agent_memory',
            action: item.id ? 'update' : 'remember',
            ...(item.id ? { id: item.id, expectedRevision: item.revision } : {}),
            kind: $('#me-kind').value, title: $('#me-title').value, content: $('#me-content').value, tags,
            importance: Number($('#me-imp').value), confidence: Number($('#me-conf').value), pinned: $('#me-pin').checked,
          });
          selectedMemId = res.id || item.id;
          status('Saved memory ' + selectedMemId);
          loadList();
          renderInspectorStats();
        } catch (e) { status(e.message, true); }
      };
      if (item.id) {
        $('#m-del').onclick = async () => {
          await api({ op: 'agent_memory', action: 'forget', id: item.id, force: true });
          selectedMemId = null;
          status('Forgot memory ' + item.id);
          renderMemory();
          renderInspectorStats();
        };
      }
    }

    $('#m-search').onclick = () => loadList().catch(e => status(e.message, true));
    $('#m-kind').onchange = () => loadList().catch(e => status(e.message, true));
    $('#m-new').onclick = () => { selectedMemId = null; loadEditor(null); };
    $('#m-cons').onclick = async () => {
      const res = await api({ op: 'agent_memory', action: 'consolidate' });
      status(`Consolidated: expired ${res.expired}, merged ${res.merged}, pruned ${res.pruned}`);
      loadList();
      renderInspectorStats();
    };
    await loadList();
    if (selectedMemId) await loadEditor(selectedMemId);
  }

  // ------------------------------------------------ Memory Architectures
  async function renderArchitectures() {
    const side = $('#mb-sidebar'), detail = $('#mb-detail');
    side.innerHTML = `
      <div class="mb-row">
        <select id="arch-pick" class="mb-fill">
          <option value="structmem">StructMem · Typed Records</option>
          <option value="amem">A-MEM · Zettelkasten Notes</option>
          <option value="magma">MAGMA · 4-View Multi-Graph</option>
          <option value="eggent">egGENT · Episodic Trajectories</option>
          <option value="gam">GAM · Pages &amp; Researcher</option>
        </select>
      </div>
      <div class="mb-row"><input id="a-q" class="mb-fill" placeholder="Query / search…"><button id="a-go" type="button" class="primary">Query</button><button id="a-new" type="button">+ New</button></div>
      <div class="mb-list" id="a-list"></div>
    `;
    $('#arch-pick').value = archSubtab;
    $('#arch-pick').onchange = () => { archSubtab = $('#arch-pick').value; renderArchitectures(); };

    async function loadSubtab() {
      const q = $('#a-q').value.trim();
      const list = $('#a-list');
      list.replaceChildren();
      if (archSubtab === 'structmem') {
        const res = await api({ op: 'memory_suite', action: 'struct_query', query: q, limit: 40 });
        for (const r of res.records || []) {
          const b = el('button', `[${r.schema}] ${r.subject}`);
          b.type = 'button'; b.append(el('small', r.object));
          b.onclick = () => editStruct(r);
          list.append(b);
        }
        detail.innerHTML = `<p>Select a StructMem record or click <strong>+ New</strong>.</p>`;
      } else if (archSubtab === 'amem') {
        const res = q ? await api({ op: 'memory_suite', action: 'amem_search', query: q, limit: 30 }) : await api({ op: 'memory_suite', action: 'amem_list', limit: 40 });
        for (const n of res.notes || []) {
          const b = el('button', n.context || n.id);
          b.type = 'button'; b.append(el('small', `${(n.tags || []).join(', ')} · ${(n.links || []).length} links`));
          b.onclick = () => {
            detail.innerHTML = `<div class="mb-row"><strong>A-MEM ${n.id}</strong><button id="am-del" type="button">Delete</button></div><pre>${JSON.stringify(n, null, 2)}</pre>`;
            $('#am-del').onclick = async () => { await api({ op: 'memory_suite', action: 'amem_delete', id: n.id }); status('Deleted A-MEM note'); loadSubtab(); renderInspectorStats(); };
          };
          list.append(b);
        }
      } else if (archSubtab === 'magma') {
        if (q) {
          const res = await api({ op: 'memory_suite', action: 'magma_query', query: q, limit: 20 });
          detail.innerHTML = `<h3>MAGMA Query (intent: ${res.intent})</h3><pre>${JSON.stringify(res, null, 2)}</pre>`;
        }
        const res = await api({ op: 'memory_suite', action: 'magma_list', limit: 40 });
        for (const n of res.nodes || []) {
          const b = el('button', `[${n.kind}] ${n.content.slice(0, 60)}`);
          b.type = 'button'; b.append(el('small', (n.entities || []).join(', ')));
          b.onclick = () => {
            detail.innerHTML = `<div class="mb-row"><strong>MAGMA Node ${n.id}</strong><button id="mg-del" type="button">Delete</button></div><pre>${JSON.stringify(n, null, 2)}</pre>`;
            $('#mg-del').onclick = async () => { await api({ op: 'memory_suite', action: 'magma_delete', id: n.id }); status('Deleted MAGMA node'); loadSubtab(); renderInspectorStats(); };
          };
          list.append(b);
        }
      } else if (archSubtab === 'eggent') {
        const res = await api({ op: 'memory_suite', action: 'eggent_query', query: q, limit: 20 });
        for (const ep of res.episodes || []) {
          const b = el('button', `[${ep.outcome}] ${ep.goal.slice(0, 60)}`);
          b.type = 'button'; b.append(el('small', `${ep.trajectory.length} steps · ${ep.transitions.length} transitions`));
          b.onclick = () => { detail.innerHTML = `<h3>egGENT Trajectory</h3><pre>${JSON.stringify(ep, null, 2)}</pre>`; };
          list.append(b);
        }
      } else if (archSubtab === 'gam') {
        if (q) {
          const res = await api({ op: 'memory_suite', action: 'gam_research', query: q, maxHops: 3, budgetChars: 6000 });
          detail.innerHTML = `<h3>GAM Research (${res.hops.length} hops · coverage ${res.coverage})</h3><pre>${JSON.stringify(res, null, 2)}</pre>`;
        }
        const res = await api({ op: 'memory_suite', action: 'gam_list', limit: 40 });
        for (const p of res.pages || []) {
          const b = el('button', p.title);
          b.type = 'button'; b.append(el('small', p.abstract));
          b.onclick = () => {
            detail.innerHTML = `<div class="mb-row"><strong>GAM Page ${p.id}</strong><button id="gp-del" type="button">Delete</button></div><pre>${JSON.stringify(p, null, 2)}</pre>`;
            $('#gp-del').onclick = async () => { await api({ op: 'memory_suite', action: 'gam_delete', id: p.id }); status('Deleted GAM page'); loadSubtab(); renderInspectorStats(); };
          };
          list.append(b);
        }
      }
      if (!list.children.length) list.textContent = 'No records in this view.';
    }

    function editStruct(rec = null) {
      detail.innerHTML = `
        <div class="mb-row"><strong>${rec ? 'StructMem ' + rec.id : 'New StructMem Record'}</strong><button type="button" id="sm-save" class="primary">Save</button>${rec ? '<button type="button" id="sm-del">Delete</button>' : ''}</div>
        <label>Schema<select id="sm-schema"><option>entity</option><option>file_summary</option><option>api_contract</option><option>error_pattern</option><option>decision</option><option>config</option><option>dependency</option></select></label>
        <label>Data JSON<textarea id="sm-data" rows="8" spellcheck="false"></textarea></label>
        <label>Tags (comma-separated)<input id="sm-tags"></label>
      `;
      $('#sm-schema').value = rec?.schema || 'file_summary';
      $('#sm-data').value = JSON.stringify(rec?.data || { path: 'example.py', purpose: 'Describe purpose' }, null, 2);
      $('#sm-tags').value = (rec?.tags || []).join(', ');
      $('#sm-save').onclick = async () => {
        try {
          const res = await api({ op: 'memory_suite', action: 'struct_store', ...(rec?.id ? { id: rec.id } : {}), schema: $('#sm-schema').value, data: JSON.parse($('#sm-data').value), tags: $('#sm-tags').value.split(',').map(s => s.trim()).filter(Boolean) });
          status('Saved StructMem ' + res.id); loadSubtab(); renderInspectorStats();
        } catch (e) { status(e.message, true); }
      };
      if (rec?.id) $('#sm-del').onclick = async () => { await api({ op: 'memory_suite', action: 'struct_delete', id: rec.id }); status('Deleted StructMem'); loadSubtab(); renderInspectorStats(); };
    }

    $('#a-go').onclick = () => loadSubtab().catch(e => status(e.message, true));
    $('#a-new').onclick = () => {
      if (archSubtab === 'structmem') return editStruct(null);
      if (archSubtab === 'amem') {
        detail.innerHTML = `<div class="mb-row"><strong>New A-MEM Note</strong><button id="am-add" class="primary" type="button">Save Note</button></div><label>Context<input id="am-ctx"></label><label>Content<textarea id="am-txt" rows="6"></textarea></label><label>Tags<input id="am-tags"></label>`;
        $('#am-add').onclick = async () => { await api({ op: 'memory_suite', action: 'amem_add', context: $('#am-ctx').value, content: $('#am-txt').value, tags: $('#am-tags').value.split(',').map(s => s.trim()).filter(Boolean) }); status('Saved A-MEM note'); loadSubtab(); renderInspectorStats(); };
      } else if (archSubtab === 'magma') {
        detail.innerHTML = `<div class="mb-row"><strong>New MAGMA Node</strong><button id="mg-add" class="primary" type="button">Add Node</button></div><label>Kind<input id="mg-kind" value="observation"></label><label>Content<textarea id="mg-txt" rows="5"></textarea></label><label>Entities (comma-separated)<input id="mg-ent"></label>`;
        $('#mg-add').onclick = async () => { await api({ op: 'memory_suite', action: 'magma_add', kind: $('#mg-kind').value, content: $('#mg-txt').value, entities: $('#mg-ent').value.split(',').map(s => s.trim()).filter(Boolean) }); status('Added MAGMA node'); loadSubtab(); renderInspectorStats(); };
      } else if (archSubtab === 'gam') {
        detail.innerHTML = `<div class="mb-row"><strong>New GAM Page</strong><button id="gp-add" class="primary" type="button">Memorize Page</button></div><label>Title<input id="gp-title"></label><label>Body<textarea id="gp-body" rows="6"></textarea></label>`;
        $('#gp-add').onclick = async () => { await api({ op: 'memory_suite', action: 'gam_memorize', title: $('#gp-title').value, body: $('#gp-body').value }); status('Memorized GAM page'); loadSubtab(); renderInspectorStats(); };
      }
    };
    await loadSubtab();
  }

  // ------------------------------------------------ Browser & Chat Storage
  function renderBrowserData() {
    const side = $('#mb-sidebar'), detail = $('#mb-detail');
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^(suite-agent|suite-ai|agent-|codeix-agent)/.test(k)) keys.push(k);
    }
    keys.sort();
    side.innerHTML = `<div class="mb-row"><strong>Browser Storage (${keys.length})</strong><button type="button" id="b-new">+ New Key</button></div><div class="mb-list" id="b-list"></div>`;
    const list = $('#b-list');
    function openKey(k = '') {
      detail.innerHTML = `
        <div class="mb-row"><input id="b-key" class="mb-fill" placeholder="localStorage key"><button type="button" id="b-save" class="primary">Save</button>${k ? '<button type="button" id="b-del">Delete</button>' : ''}</div>
        <textarea id="b-val" rows="16" spellcheck="false"></textarea>
      `;
      $('#b-key').value = k;
      if (k) {
        const raw = localStorage.getItem(k) || '';
        try { $('#b-val').value = JSON.stringify(JSON.parse(raw), null, 2); } catch { $('#b-val').value = raw; }
      }
      $('#b-save').onclick = () => {
        const key = $('#b-key').value.trim();
        if (!key) return;
        localStorage.setItem(key, $('#b-val').value);
        status('Saved ' + key);
        renderBrowserData();
      };
      if (k) $('#b-del').onclick = () => { if (!confirm('Delete ' + k + '?')) return; localStorage.removeItem(k); status('Deleted ' + k); renderBrowserData(); };
    }
    $('#b-new').onclick = () => openKey('');
    for (const k of keys) {
      const b = el('button', k); b.type = 'button';
      b.onclick = () => openKey(k);
      list.append(b);
    }
    if (!keys.length) detail.innerHTML = '<p>No AI Chat or Agent localStorage keys on this origin yet.</p>';
  }

  async function render() {
    try {
      await renderInspectorStats();
      if (activeTab === 'sessions') await renderSessions();
      else if (activeTab === 'memory') await renderMemory();
      else if (activeTab === 'architectures') await renderArchitectures();
      else renderBrowserData();
    } catch (e) { status(e.message, true); }
  }

  render();
})();
