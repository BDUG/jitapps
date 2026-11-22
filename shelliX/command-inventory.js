/* Read-only command receipt browsing; no audit restoration or command dispatch. */
(async function () {
  'use strict';
  await window.SuiteHubReady;
  const C = window.SuiteCapabilities, Q = window.SuiteHubCore, H = window.ShelliXHistory;
  if (!C || !Q || !H) return;
  const launch = document.createElement('button');
  launch.type = 'button'; launch.id = 'history-inventory'; launch.textContent = 'Command inventory';
  document.querySelector('.shell-history-controls').append(launch);
  const dialog = document.createElement('dialog');
  dialog.className = 'sd-dialog'; dialog.id = 'shell-inventory';
  dialog.setAttribute('aria-labelledby', 'shi-title');
  dialog.innerHTML = '<div class="sd-heading"><h2 id="shi-title">Command inventory</h2><button type="button" id="shi-close" aria-label="Close command inventory">×</button></div><p>Browse the loaded session’s recorded command attempts and receipts. Unknown means no receipt is recorded. Browsing and exporting never run commands or change audit history.</p><div class="sw-row"><input id="shi-query" type="search" aria-label="Search command inventory" placeholder="Command, arguments or call ID"><label>Filter field<select id="shi-field"><option value="">No field filter</option></select></label><select id="shi-operator" aria-label="Command field condition"><option value="contains">Contains text</option><option value="equals">Equals</option><option value="empty">Is empty or missing</option><option value="atLeast">Number at least</option><option value="atMost">Number at most</option></select><input id="shi-value" aria-label="Command field value" placeholder="Literal text or number"><label>Sort field<select id="shi-sort"><option value="">Attempt order</option></select></label><select id="shi-direction" aria-label="Command sort direction"><option value="asc">Ascending</option><option value="desc">Descending</option></select></div><div class="sw-row"><button type="button" id="shi-refresh">Refresh inventory</button><button type="button" id="shi-reset">Clear filters</button><select id="shi-format" aria-label="Command export format"><option value="json">JSON</option><option value="csv">CSV</option></select><button type="button" id="shi-export">Export matching commands</button></div><p id="shi-status" role="status"></p><pre id="shi-rows"></pre><div class="sw-row"><button type="button" id="shi-prev">Previous page</button><span id="shi-page" role="status"></span><button type="button" id="shi-next">Next page</button></div>';
  document.body.append(dialog);
  const q = id => dialog.querySelector('#shi-' + id);
  let rows = [], baseline = '', offset = 0, result;
  const options = () => ({query: q('query').value, field: q('field').value,
    operator: q('operator').value, value: q('value').value,
    sortKey: q('sort').value, direction: q('direction').value, offset, limit: 25});
  function render() {
    result = Q.inventory(rows, options()); offset = result.offset;
    q('rows').textContent = JSON.stringify(result.entries.map(e => e.row), null, 2);
    q('status').textContent = result.total + ' command attempts · ' + result.matched + ' matching. Export includes all matches.';
    q('page').textContent = result.matched ? 'Page ' + (offset / 25 + 1) + ' of ' + Math.ceil(result.matched / 25) : 'No matching commands';
    q('prev').disabled = !offset; q('next').disabled = offset + 25 >= result.matched;
    q('operator').disabled = !q('field').value;
    q('value').disabled = !q('field').value || q('operator').value === 'empty';
    q('direction').disabled = !q('sort').value;
  }
  function safe(fn) {
    return Promise.resolve().then(fn).catch(error => { q('status').textContent = error.message; });
  }
  function refresh() {
    const snapshot = H.snapshot(); baseline = JSON.stringify(snapshot);
    rows = C.inventory('shelliX', snapshot); offset = 0;
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    for (const id of ['field', 'sort']) {
      const select = q(id), previous = select.value, first = select.options[0];
      select.replaceChildren(first);
      for (const key of keys) { const option = document.createElement('option'); option.value = key; option.textContent = key; select.append(option); }
      select.value = keys.includes(previous) ? previous : '';
    }
    render();
  }
  launch.onclick = () => safe(() => { refresh(); dialog.showModal(); q('query').focus(); });
  q('close').onclick = () => dialog.close();
  q('refresh').onclick = () => safe(refresh);
  for (const id of ['query', 'value']) q(id).oninput = () => safe(() => { offset = 0; render(); });
  for (const id of ['field', 'operator', 'sort', 'direction']) q(id).onchange = () => safe(() => { offset = 0; render(); });
  q('reset').onclick = () => safe(() => {
    for (const id of ['query', 'value', 'field', 'sort']) q(id).value = '';
    q('operator').value = 'contains'; q('direction').value = 'asc'; offset = 0; render();
  });
  q('prev').onclick = () => safe(() => { offset = Math.max(0, offset - 25); render(); });
  q('next').onclick = () => safe(() => { offset += 25; render(); });
  q('export').onclick = () => safe(async () => {
    if (JSON.stringify(H.snapshot()) !== baseline) throw Error('Session history changed. Refresh command inventory before exporting.');
    const matches = Q.inventory(rows, options()).all.map(e => e.row), format = q('format').value;
    const text = format === 'csv' ? C.csv(matches) : JSON.stringify({tool: 'shelliX', items: matches}, null, 2);
    const url = URL.createObjectURL(new Blob([text], {type: format === 'csv' ? 'text/csv' : 'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'shelliX.commands.filtered.' + format;
    try { await SuiteDiskUI.download(anchor); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
  });
})().catch(error => console.warn('Command inventory unavailable: ' + error.message));
