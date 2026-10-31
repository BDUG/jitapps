(function () {
  "use strict";
  if (window.SuiteReview) return;
  const base = new URL("../", document.currentScript.src),
    app = SuiteApps.find((a) =>
      location.pathname.startsWith(new URL(a.id + "/", base).pathname),
    ),
    C = SuiteReviewCore;
  let captured = null,
    source = "",
    selected = new Set(),
    limit = 100,
    busy = false;
  const el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const css = el("link");
  css.rel = "stylesheet";
  css.href = new URL("shared-suite/review.css?v=followup-20261031", base).href;
  document.head.append(css);
  const dialog = el("dialog");
  dialog.id = "suite-review";
  dialog.setAttribute("aria-labelledby", "rv-title");
  dialog.innerHTML = `<header><div><h2 id="rv-title">Review current work</h2><p id="rv-context"></p></div><button id="rv-close" aria-label="Close work review">×</button></header><p>Advisory checks inspect a snapshot. They do not run commands, apply changes, or certify that work is correct.</p><div class="rv-actions"><button id="rv-refresh">Refresh review</button><label>Severity<select id="rv-severity"><option value="">All findings</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Suggestions</option></select></label><label>Find<input id="rv-query" type="search" placeholder="Finding, location or code"></label></div><p id="rv-count" role="status"></p><div class="rv-actions"><button id="rv-select">Select filtered findings</button><button id="rv-clear">Clear selection</button><button id="rv-tasks" disabled>Add selected as notebook tasks</button><label>Export scope<select id="rv-export-scope"><option value="all">All findings</option><option value="filtered">Filtered findings</option><option value="selected">Selected findings</option></select></label><label>Format<select id="rv-export-format"><option value="json">JSON</option><option value="md">Markdown</option></select></label><button id="rv-export" disabled>Export review</button></div><fieldset class="rv-followup"><legend>Follow up on selected findings</legend><label>Goal <select id="rv-intent"><option value="investigate">Investigate</option><option value="improve">Improve</option><option value="verify">Verify</option></select></label><button id="rv-draft" disabled>Draft in AI chat</button><button id="rv-brief" disabled>Export AI brief</button><p>Drafts are editable and unsent. Review selected findings and sensitive text before sharing.</p></fieldset><div id="rv-list"></div><button id="rv-more" hidden>Show 100 more</button><p id="rv-limitations"></p><p id="rv-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const q = (id) => dialog.querySelector("#" + id);
  function status(text) {
    q("rv-status").textContent = text;
  }
  async function snapshot() {
    if (!app) throw Error("Open an app to review its current work.");
    if (app.id === "shelliX") {
      if (!window.ShelliXDiagnostics)
        throw Error("Wait for shelliX to finish loading.");
      const audit = ShelliXDiagnostics.report();
      return {
        audit: { findings: audit.findings, limitations: audit.limitations },
      };
    }
    const adapter = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
    if (!adapter?.snapshot)
      throw Error("The app document is not ready yet. Try Refresh review.");
    const value = await adapter.snapshot();
    if (!value || typeof value !== "object")
      throw Error("The app did not supply a document snapshot.");
    return JSON.parse(JSON.stringify(value));
  }
  function filtered() {
    return (captured?.findings || [])
      .map((finding, index) => ({ finding, index }))
      .filter(
        ({ finding: f }) =>
          (!q("rv-severity").value || f.severity === q("rv-severity").value) &&
          [f.code, f.path, f.message]
            .join(" ")
            .toLocaleLowerCase()
            .includes(q("rv-query").value.toLocaleLowerCase().trim()),
      );
  }
  function render() {
    const rows = filtered();
    q("rv-list").replaceChildren();
    for (const { finding: f, index } of rows.slice(0, limit)) {
      const row = el("article"),
        label = el("label"),
        check = el("input"),
        body = el("div");
      check.type = "checkbox";
      check.checked = selected.has(index);
      check.setAttribute(
        "aria-label",
        "Select finding " + f.code + " at " + (f.path || "document"),
      );
      check.onchange = () => {
        if (check.checked) selected.add(index);
        else selected.delete(index);
        counts(rows.length);
      };
      body.append(
        el("strong", f.severity + " · " + f.code),
        el("p", f.message),
        el("small", f.path || "Document"),
      );
      label.append(check, body);
      row.append(label);
      q("rv-list").append(row);
    }
    if (captured && !rows.length)
      q("rv-list").append(
        el(
          "p",
          "No findings match this view. A clean report does not establish correctness.",
        ),
      );
    q("rv-more").hidden = rows.length <= limit;
    q("rv-export").disabled = busy || !captured;
    q("rv-limitations").textContent = captured?.limitations || "";
    counts(rows.length);
  }
  function counts(matching) {
    q("rv-count").textContent = captured
      ? captured.counts.error +
        " errors · " +
        captured.counts.warning +
        " warnings · " +
        captured.counts.info +
        " suggestions · " +
        matching +
        " matching · " +
        Math.min(limit, matching) +
        " displayed · " +
        selected.size +
        " selected"
      : "Refresh the current snapshot to start.";
    q("rv-tasks").disabled = busy || !selected.size;
    q("rv-draft").disabled = q("rv-brief").disabled = busy || !selected.size;
    q("rv-clear").disabled = !selected.size;
    q("rv-export").disabled =
      busy ||
      !captured ||
      (q("rv-export-scope").value === "selected" && !selected.size);
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    q("rv-refresh").disabled = true;
    q("rv-tasks").disabled = true;
    q("rv-export").disabled = true;
    q("rv-draft").disabled = q("rv-brief").disabled = true;
    try {
      await fn();
    } catch (error) {
      status(error.message);
    } finally {
      busy = false;
      q("rv-refresh").disabled = false;
      render();
    }
  }
  async function refresh() {
    const d = await snapshot(),
      result = C.report(app.id, d);
    captured = result;
    source = JSON.stringify(d);
    selected.clear();
    limit = 100;
    q("rv-context").textContent =
      app.name + " · snapshot " + new Date(result.createdAt).toLocaleString();
    render();
    status("Review refreshed. The app document is unchanged.");
  }
  q("rv-close").onclick = () => dialog.close();
  q("rv-refresh").onclick = () => run(refresh);
  for (const id of ["rv-query", "rv-severity"])
    q(id).addEventListener(id === "rv-query" ? "input" : "change", () => {
      limit = 100;
      render();
    });
  q("rv-more").onclick = () => {
    limit += 100;
    render();
  };
  q("rv-select").onclick = () => {
    for (const row of filtered()) selected.add(row.index);
    render();
  };
  q("rv-clear").onclick = () => {
    selected.clear();
    render();
  };
  q("rv-tasks").onclick = () =>
    run(async () => {
      if (!captured || !selected.size) throw Error("Select findings first.");
      const current = await snapshot();
      if (JSON.stringify(current) !== source)
        throw Error(
          "The app content changed after this review. Refresh review and select current findings.",
        );
      const key = "suite-notebook-v1:" + app.id,
        raw = localStorage.getItem(key),
        existing = raw === null ? null : JSON.parse(raw),
        title =
          current.name ||
          current.project?.name ||
          current.metamodel?.name ||
          app.name,
        result = C.toNotebook(
          existing,
          app.id,
          title,
          captured.findings.filter((f, i) => selected.has(i)),
        );
      if (localStorage.getItem(key) !== raw)
        throw Error(
          "The saved notebook changed. Retry after checking its current tasks.",
        );
      localStorage.setItem(key, JSON.stringify(result.doc));
      status(
        result.added +
          " review tasks added to " +
          app.name +
          " notes. Existing tasks and unsaved notebook drafts were not overwritten.",
      );
    });
  async function currentBrief() {
    if (!captured || !selected.size) throw Error("Select findings first.");
    const current = await snapshot();
    if (JSON.stringify(current) !== source)
      throw Error(
        "The app content changed after this review. Refresh review and select current findings.",
      );
    if (app.id === "codeiX" && current.aiExcluded?.length)
      throw Error(
        "Review AI-excluded files before preparing an AI review brief. Local review exports remain available.",
      );
    return C.brief(captured, [...selected], q("rv-intent").value);
  }
  q("rv-draft").onclick = () =>
    run(async () => {
      const brief = await currentBrief();
      const input = document.querySelector(
        app.id === "codeiX"
          ? "#ag-goal"
          : app.id === "shelliX"
            ? "#prompt"
            : "#sai-prompt",
      );
      if (!input || input.disabled || input.readOnly)
        throw Error(
          "Finish the active operation and open the AI composer before drafting.",
        );
      const combined = input.value + (input.value.trim() ? "\n\n" : "") + brief;
      if (combined.length > (input.maxLength > 0 ? input.maxLength : 100000))
        throw Error(
          "The AI draft is too long. Select fewer findings or shorten the existing draft.",
        );
      if (
        app.id === "shelliX" &&
        document.querySelector("#agent-input")?.hidden
      ) {
        window.ShelliXTerminal?.mode("agent", false);
        if (document.querySelector("#agent-input")?.hidden)
          throw Error(
            "Finish the active shell operation before opening the agent composer.",
          );
      }
      if (
        app.id === "codeiX" &&
        document.body.classList.contains("agent-hidden")
      )
        document.querySelector("#toggleAgent")?.click();
      if (
        app.id !== "codeiX" &&
        app.id !== "shelliX" &&
        document.querySelector("#sai-panel")?.hidden
      )
        document.querySelector("#sai-launch")?.click();
      input.value = combined;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      dialog.close();
      input.focus();
      status(
        "Review follow-up drafted. Review before sending; no request was sent.",
      );
    });
  q("rv-brief").onclick = () =>
    run(async () => {
      const text = await currentBrief(),
        url = URL.createObjectURL(new Blob([text], { type: "text/markdown" })),
        a = el("a");
      a.href = url;
      a.download = app.id + ".review-" + q("rv-intent").value + ".md";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status(
        "AI brief exported. No request was sent and the document is unchanged.",
      );
    });
  q("rv-export-scope").onchange = () => counts(filtered().length);
  q("rv-export").onclick = () => {
    if (!captured) return;
    try {
      const scope = q("rv-export-scope").value;
      const indices =
        scope === "selected"
          ? [...selected]
          : scope === "filtered"
            ? filtered().map((row) => row.index)
            : [];
      const report = C.scopedReport(captured, scope, indices);
      const format = q("rv-export-format").value;
      const text =
        format === "md" ? C.markdown(report) : JSON.stringify(report, null, 2);
      const url = URL.createObjectURL(
        new Blob([text], {
          type: format === "md" ? "text/markdown" : "application/json",
        }),
      );
      const a = el("a");
      a.href = url;
      a.download = app.id + ".work-review." + scope + "." + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status(
        "Exported " +
          report.findings.length +
          " " +
          scope +
          " findings. The captured report and document are unchanged.",
      );
    } catch (error) {
      status(error.message);
    }
  };
  window.SuiteReview = {
    open: () => {
      if (!dialog.open) dialog.showModal();
      run(refresh);
    },
  };
})();
