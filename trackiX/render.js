(function (root) {
  'use strict';

  function renderBoard(container, doc, options) {
    const { Trackix } = root;
    const { issues, activeId, viewMode, onSelect, onMove } = options;
    container.replaceChildren();

    if (viewMode === 'list') {
      const table = document.createElement('table');
      table.className = 'issue-table';
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      for (const h of ['Key', 'Type', 'Summary', 'Status', 'Priority', 'Assignee', 'Pts']) {
        const th = document.createElement('th');
        th.textContent = h;
        hr.append(th);
      }
      thead.append(hr);
      table.append(thead);
      const tbody = document.createElement('tbody');
      for (const iss of issues) {
        const tr = document.createElement('tr');
        tr.dataset.id = iss.id;
        if (iss.id === activeId) tr.classList.add('selected');
        tr.onclick = () => onSelect(iss.id);
        for (const val of [iss.key, iss.type, iss.summary, Trackix.STATUS_LABELS[iss.status] || iss.status, iss.priority, iss.assignee || 'Unassigned', iss.points ?? '—']) {
          const td = document.createElement('td');
          td.textContent = String(val);
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(tbody);
      container.append(table);
      return;
    }

    const board = document.createElement('div');
    board.className = 'kanban-board';
    for (const status of Trackix.STATUSES) {
      const col = document.createElement('section');
      col.className = 'kanban-col';
      col.dataset.status = status;
      const colIssues = issues.filter(i => i.status === status);
      const head = document.createElement('header');
      head.className = 'kanban-col-head';
      const title = document.createElement('strong');
      title.textContent = Trackix.STATUS_LABELS[status] || status;
      const count = document.createElement('span');
      count.className = 'col-count';
      count.textContent = String(colIssues.length);
      head.append(title, count);
      col.append(head);

      const list = document.createElement('div');
      list.className = 'kanban-cards';
      for (const iss of colIssues) {
        const card = document.createElement('article');
        card.className = 'issue-card' + (iss.id === activeId ? ' selected' : '');
        card.dataset.id = iss.id;
        card.tabIndex = 0;
        card.onclick = () => onSelect(iss.id);
        card.onkeydown = e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(iss.id);
          }
        };

        const top = document.createElement('div');
        top.className = 'issue-card-top';
        const keySpan = document.createElement('span');
        keySpan.className = 'issue-key';
        keySpan.textContent = iss.key;
        const typeSpan = document.createElement('span');
        typeSpan.className = 'badge badge-' + iss.type;
        typeSpan.textContent = iss.type;
        const prioSpan = document.createElement('span');
        prioSpan.className = 'badge prio-' + iss.priority;
        prioSpan.textContent = iss.priority;
        top.append(keySpan, typeSpan, prioSpan);

        const summary = document.createElement('p');
        summary.className = 'issue-summary';
        summary.textContent = iss.summary;

        const meta = document.createElement('div');
        meta.className = 'issue-meta';
        const owner = document.createElement('span');
        owner.textContent = iss.assignee || 'Unassigned';
        const pts = document.createElement('span');
        pts.textContent = iss.points !== null && iss.points !== undefined ? `${iss.points} pt` : '';
        meta.append(owner, pts);

        const nav = document.createElement('div');
        nav.className = 'issue-move';
        const idx = Trackix.STATUSES.indexOf(iss.status);
        if (idx > 0) {
          const prev = document.createElement('button');
          prev.type = 'button';
          prev.textContent = '←';
          prev.title = 'Move to ' + Trackix.STATUS_LABELS[Trackix.STATUSES[idx - 1]];
          prev.onclick = e => { e.stopPropagation(); onMove(iss.id, Trackix.STATUSES[idx - 1]); };
          nav.append(prev);
        }
        if (idx < Trackix.STATUSES.length - 1) {
          const next = document.createElement('button');
          next.type = 'button';
          next.textContent = '→';
          next.title = 'Move to ' + Trackix.STATUS_LABELS[Trackix.STATUSES[idx + 1]];
          next.onclick = e => { e.stopPropagation(); onMove(iss.id, Trackix.STATUS_LABELS ? Trackix.STATUSES[idx + 1] : 'done'); };
          nav.append(next);
        }

        card.append(top, summary, meta, nav);
        list.append(card);
      }
      col.append(list);
      board.append(col);
    }
    container.append(board);
  }

  root.TrackixRender = { renderBoard };
})(typeof window === 'undefined' ? globalThis : window);
