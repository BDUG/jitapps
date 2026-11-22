(function (root) {
  'use strict';
  const STORAGE_KEY = 'tlal-trackix-v1';
  const $ = id => document.getElementById(id);
  const copy = v => JSON.parse(JSON.stringify(v));

  let doc = Trackix.createDefault();
  let viewMode = 'board';
  let undoStack = [];
  let redoStack = [];
  let busy = false;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) doc = Trackix.validate(JSON.parse(saved));
  } catch {
    doc = Trackix.createDefault();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      $('save-state').textContent = 'Saved locally';
    } catch {
      $('save-state').textContent = 'Storage full';
    }
  }

  function commit(nextDoc, recordUndo = true) {
    const validated = Trackix.validate(nextDoc);
    if (recordUndo) {
      undoStack.push(copy(doc));
      if (undoStack.length > 60) undoStack.shift();
      redoStack = [];
    }
    doc = validated;
    persist();
    renderAll();
  }

  function selectedIssue() {
    return doc.issues.find(i => i.id === doc.activeId) || doc.issues[0] || null;
  }

  function filteredIssues() {
    const q = ($('search')?.value || '').trim().toLowerCase();
    const sprint = $('filter-sprint')?.value || '';
    const type = $('filter-type')?.value || '';
    return doc.issues.filter(i => {
      if (sprint && (sprint === '__none__' ? i.sprintId : i.sprintId !== sprint)) return false;
      if (type && i.type !== type) return false;
      if (q && !`${i.key} ${i.summary} ${i.assignee} ${(i.labels || []).join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderSprints() {
    const list = $('sprint-list');
    const filter = $('filter-sprint');
    const propSprint = $('issue-sprint');
    if (!list || !filter || !propSprint) return;

    const currentFilter = filter.value;
    list.replaceChildren();
    filter.replaceChildren(new Option('All sprints & backlog', ''), new Option('No sprint (Backlog)', '__none__'));
    propSprint.replaceChildren(new Option('No sprint (Backlog)', ''));

    for (const s of doc.sprints) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sprint-item' + (currentFilter === s.id ? ' active' : '');
      const count = doc.issues.filter(i => i.sprintId === s.id).length;
      btn.textContent = `${s.name} · ${s.state} (${count})`;
      btn.onclick = () => {
        filter.value = filter.value === s.id ? '' : s.id;
        renderBoardOnly();
        renderSprints();
      };
      list.append(btn);
      filter.append(new Option(`${s.name} (${s.state})`, s.id));
      propSprint.append(new Option(`${s.name} (${s.state})`, s.id));
    }
    if (currentFilter) filter.value = currentFilter;
  }

  function renderInspector() {
    const iss = selectedIssue();
    const has = Boolean(iss);
    for (const id of ['issue-summary', 'issue-type', 'issue-status', 'issue-priority', 'issue-assignee', 'issue-points', 'issue-sprint', 'issue-labels', 'issue-blocked', 'issue-desc', 'comment-text', 'add-comment', 'duplicate-issue', 'delete-issue']) {
      if ($(id)) $(id).disabled = !has;
    }
    if (!iss) {
      if ($('issue-key-label')) $('issue-key-label').textContent = 'No issue selected';
      return;
    }
    $('issue-key-label').textContent = iss.key;
    $('issue-summary').value = iss.summary;
    $('issue-type').value = iss.type;
    $('issue-status').value = iss.status;
    $('issue-priority').value = iss.priority;
    $('issue-assignee').value = iss.assignee || '';
    $('issue-points').value = iss.points ?? '';
    $('issue-sprint').value = iss.sprintId || '';
    $('issue-labels').value = (iss.labels || []).join(', ');
    $('issue-blocked').value = (iss.blockedBy || []).join(', ');
    $('issue-desc').value = iss.description || '';

    const commentsEl = $('issue-comments');
    if (commentsEl) {
      commentsEl.replaceChildren();
      for (const c of iss.comments || []) {
        const li = document.createElement('li');
        li.textContent = `${c.author}: ${c.text}`;
        commentsEl.append(li);
      }
    }
  }

  function renderBoardOnly() {
    const m = Trackix.metrics(doc);
    if ($('metrics-bar')) {
      $('metrics-bar').textContent = `${m.total} issues · ${m.counts.in_progress} in progress · ${m.donePoints}/${m.totalPoints} pts done · ${m.blocked} blocked`;
    }
    TrackixRender.renderBoard($('board-wrap'), doc, {
      issues: filteredIssues(),
      activeId: doc.activeId,
      viewMode,
      onSelect: id => {
        doc.activeId = id;
        renderBoardOnly();
        renderInspector();
      },
      onMove: (id, status) => {
        const next = copy(doc);
        const item = next.issues.find(i => i.id === id);
        if (item) {
          item.status = status;
          commit(next);
          $('status').textContent = `Moved ${item.key} to ${Trackix.STATUS_LABELS[status]}`;
        }
      },
    });
  }

  function renderAll() {
    $('name').value = doc.name;
    if ($('project-key')) $('project-key').value = doc.projectKey;
    $('undo').disabled = undoStack.length === 0;
    $('redo').disabled = redoStack.length === 0;
    renderSprints();
    renderBoardOnly();
    renderInspector();
  }

  function updateSelected(patchFn) {
    const iss = selectedIssue();
    if (!iss) return;
    const next = copy(doc);
    const target = next.issues.find(i => i.id === iss.id);
    if (!target) return;
    patchFn(target);
    commit(next);
  }

  function bindEvents() {
    $('name').onchange = () => {
      const next = copy(doc);
      next.name = $('name').value.trim() || 'Untitled Board';
      commit(next);
    };
    $('project-key').onchange = () => {
      const next = copy(doc);
      next.projectKey = $('project-key').value.trim().toUpperCase() || 'TRK';
      commit(next);
    };
    $('undo').onclick = () => {
      if (!undoStack.length) return;
      redoStack.push(copy(doc));
      doc = Trackix.validate(undoStack.pop());
      persist();
      renderAll();
    };
    $('redo').onclick = () => {
      if (!redoStack.length) return;
      undoStack.push(copy(doc));
      doc = Trackix.validate(redoStack.pop());
      persist();
      renderAll();
    };
    $('view-board').onclick = () => { viewMode = 'board'; renderBoardOnly(); };
    $('view-list').onclick = () => { viewMode = 'list'; renderBoardOnly(); };
    $('search').oninput = renderBoardOnly;
    $('filter-sprint').onchange = () => { renderBoardOnly(); renderSprints(); };
    $('filter-type').onchange = renderBoardOnly;

    $('new-board').onclick = () => {
      commit(Trackix.createDefault());
      $('status').textContent = 'Reset to default board';
    };

    $('add-issue').onclick = () => {
      const next = copy(doc);
      const num = next.nextNumber || (next.issues.length + 1);
      const id = 'iss-' + (root.crypto?.randomUUID?.() || Date.now().toString(36));
      const key = `${next.projectKey}-${num}`;
      const activeSprint = next.sprints.find(s => s.state === 'active')?.id || null;
      next.issues.unshift({
        id,
        key,
        type: 'story',
        summary: 'New issue ' + key,
        description: '',
        status: 'todo',
        priority: 'medium',
        assignee: '',
        reporter: 'User',
        sprintId: activeSprint,
        parentKey: null,
        points: 1,
        labels: [],
        blockedBy: [],
        comments: [],
      });
      next.activeId = id;
      next.nextNumber = num + 1;
      commit(next);
      $('issue-summary').focus();
      $('status').textContent = 'Created ' + key;
    };

    $('duplicate-issue').onclick = () => {
      const iss = selectedIssue();
      if (!iss) return;
      const next = copy(doc);
      const num = next.nextNumber || (next.issues.length + 1);
      const id = 'iss-' + (root.crypto?.randomUUID?.() || Date.now().toString(36));
      const key = `${next.projectKey}-${num}`;
      next.issues.unshift({ ...copy(iss), id, key, summary: iss.summary + ' (copy)', comments: [] });
      next.activeId = id;
      next.nextNumber = num + 1;
      commit(next);
      $('status').textContent = 'Duplicated as ' + key;
    };

    $('delete-issue').onclick = () => {
      const iss = selectedIssue();
      if (!iss) return;
      const next = copy(doc);
      next.issues = next.issues.filter(i => i.id !== iss.id);
      next.activeId = next.issues[0]?.id || null;
      commit(next);
      $('status').textContent = 'Deleted ' + iss.key;
    };

    $('add-sprint').onclick = () => {
      const next = copy(doc);
      const n = next.sprints.length + 1;
      next.sprints.push({ id: 'spr-' + Date.now().toString(36), name: 'Sprint ' + (13 + n), goal: '', state: 'planned' });
      commit(next);
      $('status').textContent = 'Added sprint';
    };

    $('issue-summary').onchange = () => updateSelected(i => { i.summary = $('issue-summary').value.trim() || i.summary; });
    $('issue-type').onchange = () => updateSelected(i => { i.type = $('issue-type').value; });
    $('issue-status').onchange = () => updateSelected(i => { i.status = $('issue-status').value; });
    $('issue-priority').onchange = () => updateSelected(i => { i.priority = $('issue-priority').value; });
    $('issue-assignee').onchange = () => updateSelected(i => { i.assignee = $('issue-assignee').value.trim(); });
    $('issue-points').onchange = () => updateSelected(i => { i.points = $('issue-points').value === '' ? null : Number($('issue-points').value); });
    $('issue-sprint').onchange = () => updateSelected(i => { i.sprintId = $('issue-sprint').value || null; });
    $('issue-labels').onchange = () => updateSelected(i => { i.labels = $('issue-labels').value.split(',').map(s => s.trim()).filter(Boolean); });
    $('issue-blocked').onchange = () => updateSelected(i => { i.blockedBy = $('issue-blocked').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean); });
    $('issue-desc').onchange = () => updateSelected(i => { i.description = $('issue-desc').value; });

    $('add-comment').onclick = () => {
      const text = $('comment-text').value.trim();
      if (!text) return;
      $('comment-text').value = '';
      updateSelected(i => {
        i.comments = [...(i.comments || []), { id: 'cmt-' + Date.now().toString(36), author: 'User', text, createdAt: new Date().toISOString() }];
      });
    };

    $('import').onclick = () => $('file').click();
    $('file').onchange = async e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        commit(parsed);
        $('status').textContent = 'Project imported';
      } catch (err) {
        $('status').textContent = 'Import failed: ' + err.message;
      }
    };

    $('open-export').onclick = () => $('export-dialog').showModal();
    $('export-close').onclick = () => $('export-dialog').close();
    $('doExport').onclick = () => {
      const fmt = $('format').value;
      const content = fmt === 'csv' ? Trackix.toCsv(doc) : JSON.stringify(doc, null, 2);
      const mime = fmt === 'csv' ? 'text/csv' : 'application/json';
      const ext = fmt === 'csv' ? 'csv' : 'json';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.projectKey.toLowerCase()}-board.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $('export-dialog').close();
    };
  }

  root.TrackixApp = {
    snapshot: () => copy(doc),
    selection: () => selectedIssue(),
    validate: async candidate => Trackix.validate(candidate),
    apply: async next => { commit(next); },
    restore: async prev => { commit(prev, false); },
    isBusy: () => busy,
  };

  if (typeof document !== 'undefined') {
    bindEvents();
    renderAll();
  }
})(typeof window === 'undefined' ? globalThis : window);
