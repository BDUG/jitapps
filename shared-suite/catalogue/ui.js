(function () {
  "use strict";
  if (window.SuiteCatalogue) return;
  const base = new URL("../../", document.currentScript.src),
    app = SuiteApps.find((a) =>
      location.pathname.startsWith(new URL(a.id + "/", base).pathname),
    ),
    C = SuiteNativeCatalogue,
    P = SuiteCataloguePreferences,
    el = (t, text) => {
      const n = document.createElement(t);
      if (text !== undefined) n.textContent = text;
      return n;
    };
  if (!app) return;
  const style = el("link");
  style.rel = "stylesheet";
  style.href = new URL(
    "shared-suite/catalogue/style.css?v=catalogue-view-20261108",
    base,
  );
  document.head.append(style);
  const dialog = el("dialog");
  dialog.id = "suite-native-catalogue";
  dialog.setAttribute("aria-labelledby", "nc-title");
  dialog.innerHTML =
    '<header><h2 id="nc-title">Templates & layouts</h2><button id="nc-close" aria-label="Close catalogue">×</button></header><p>Editable native starting points and layout themes. Templates replace content; layouts restyle or arrange current content. Preview before applying. Preparing catalogue entries uses no AI or terminal commands.</p><label>Find<input id="nc-query" type="search" placeholder="Template or layout name"></label><div class="nc-filters"><label>View<select id="nc-view"><option value="all">All entries</option><option value="pinned">Favourites</option><option value="recent">Recent previews</option></select></label><label>Kind<select id="nc-kind"><option value="">Templates & layouts</option><option value="template">Templates</option><option value="layout">Layouts</option></select></label><button id="nc-clear-recent">Clear recent previews</button><button id="nc-reset-prefs">Reset view preferences</button></div><p id="nc-count" role="status"></p><div id="nc-list"></div><button id="nc-more" hidden>Show 50 more</button><details id="nc-preview" hidden><summary>Inspect complete native candidate</summary><pre id="nc-json"></pre></details><div><button id="nc-apply" hidden>Use reviewed candidate</button><button id="nc-save" disabled>Save editable copy</button><button id="nc-export" disabled>Export candidate JSON</button></div><details id="nc-saved"><summary>My saved native templates</summary><label>Copy name<input id="nc-copy-name" maxlength="120" placeholder="Name your edited template"></label><button id="nc-save-current">Save current as new template</button><button id="nc-refresh-saved">Refresh saved templates</button><div id="nc-saved-list"></div></details><p id="nc-status" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const q = (id) => dialog.querySelector("#" + id);
  let seeds = null,
    pending = null,
    busy = false,
    records = [],
    limit = 50;
  const preferenceKey = "suite-catalogue-view:" + app.id;
  let prefs = P.parse(null),
    preferenceError = "";
  function readPreferences() {
    try {
      prefs = P.parse(localStorage.getItem(preferenceKey));
      preferenceError = "";
    } catch (error) {
      preferenceError = error.message;
    }
  }
  function updatePreferences(change) {
    const raw = localStorage.getItem(preferenceKey),
      current = P.parse(raw),
      next = change(current);
    if (localStorage.getItem(preferenceKey) !== raw)
      throw Error("View preferences changed. Retry the action.");
    localStorage.setItem(preferenceKey, JSON.stringify(next));
    prefs = next;
    preferenceError = "";
    render();
  }
  readPreferences();
  function adapter() {
    return window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
  }
  async function snapshot() {
    if (app.id === "shelliX")
      return {
        command: document.querySelector("#shell-command").value,
        cwd: document.querySelector("#cwd").value,
        timeout: Number(document.querySelector("#timeout").value),
      };
    const A = adapter();
    if (!A?.snapshot) throw Error("Wait for the app document to load.");
    return JSON.parse(JSON.stringify(await A.snapshot()));
  }
  function status(t) {
    q("nc-status").textContent = t;
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      status(e.message);
      if (!dialog.open) dialog.showModal();
    } finally {
      busy = false;
    }
  }
  async function preview(entry, stored) {
    if (adapter()?.isBusy?.())
      throw Error("Finish the active app operation first.");
    const before = await snapshot(),
      candidate = stored
        ? JSON.parse(JSON.stringify(stored))
        : C.create(app.id, entry.id, seeds, before);
    let value = candidate;
    if (
      app.id !== "shelliX" &&
      !(app.id === "projectiX" && entry.kind === "layout")
    )
      value = await adapter().validate(candidate, before);
    if (JSON.stringify(await snapshot()) !== JSON.stringify(before))
      throw Error("The document changed. Preview again.");
    pending = { value, before, entry };
    q("nc-json").textContent = JSON.stringify(value, null, 2);
    q("nc-preview").hidden = false;
    q("nc-save").disabled = q("nc-export").disabled = false;
    const viewLayout = app.id === "projectiX" && entry.kind === "layout";
    q("nc-save").disabled = viewLayout;
    q("nc-apply").hidden = !!window.SuiteWorkspace && !viewLayout;
    if (window.SuiteWorkspace && !viewLayout) {
      dialog.close();
      SuiteWorkspace.open("inspector");
      await SuiteWorkspace.review(value, entry.name);
      if (document.querySelector("#sw-review")?.hidden) return;
    } else {
      q("nc-preview").open = true;
      status(
        "Review the native candidate. Use reviewed candidate applies it; shell snippets only load into the command draft.",
      );
    }
    rememberPreview(entry);
  }
  function rememberPreview(entry) {
    try {
      updatePreferences((p) =>
        P.remember(
          p,
          entry.key ||
            (entry.id.startsWith("saved-")
              ? "saved:" + entry.id.slice(6)
              : "builtin:" + entry.id),
        ),
      );
    } catch (error) {
      preferenceError = error.message;
    }
  }
  function render() {
    q("nc-list").replaceChildren();
    const entries = [
      ...(C.names[app.id] ? C.entries(app.id) : []).map((e) => ({
        ...e,
        key: "builtin:" + e.id,
        origin: "Built-in",
      })),
      ...records.map((r) => ({
        id: "saved-" + r.id,
        key: "saved:" + r.id,
        name: r.name,
        description: r.description || "",
        tags: r.tags || [],
        kind: "template",
        origin: "Saved copy",
        document: r.document,
      })),
    ];
    const matches = P.select(entries, prefs, {
      query: q("nc-query").value,
      view: q("nc-view").value,
      kind: q("nc-kind").value,
    });
    for (const entry of matches.slice(0, limit)) {
      const article = el("article");
      article.dataset.catalogueKey = entry.key;
      article.append(
        el("strong", entry.name + " · " + entry.kind),
        el("small", entry.origin),
        el("p", entry.description),
      );
      const previewButton = el("button", "Preview " + entry.name);
      previewButton.onclick = () => run(() => preview(entry, entry.document));
      const wantedPin = !prefs.pinned.includes(entry.key);
      const pin = el(
        "button",
        prefs.pinned.includes(entry.key) ? "Unpin" : "Pin",
      );
      pin.setAttribute(
        "aria-label",
        (prefs.pinned.includes(entry.key) ? "Unpin " : "Pin ") + entry.name,
      );
      pin.setAttribute(
        "aria-pressed",
        String(prefs.pinned.includes(entry.key)),
      );
      pin.onclick = () =>
        run(() => {
          updatePreferences((p) => P.setPinned(p, entry.key, wantedPin));
          const replacement = [
            ...q("nc-list").querySelectorAll("article"),
          ].find((n) => n.dataset.catalogueKey === entry.key);
          const target =
            replacement?.querySelectorAll("button")[1] || q("nc-view");
          target.focus({ preventScroll: true });
        });
      article.append(previewButton, pin);
      q("nc-list").append(article);
    }
    q("nc-count").textContent =
      matches.length +
      " matching entries · " +
      Math.min(limit, matches.length) +
      " displayed · " +
      records.length +
      " saved copies";
    q("nc-more").hidden = matches.length <= limit;
    q("nc-clear-recent").disabled = !prefs.recent.length;
    if (!matches.length)
      q("nc-list").append(
        el(
          "p",
          q("nc-view").value === "pinned"
            ? "No favourites match. Pin entries from All entries."
            : q("nc-view").value === "recent"
              ? "No recent previews match. Preview an entry to add it here."
              : !C.names[app.id] && !records.length
                ? "No bundled starters for this app yet. Open My saved native templates to save the current document as a reusable template."
                : "No catalogue entries match this search.",
        ),
      );
    if (preferenceError) status(preferenceError);
  }
  for (const id of ["nc-query", "nc-view", "nc-kind"])
    q(id).addEventListener(id === "nc-query" ? "input" : "change", () => {
      limit = 50;
      render();
    });
  q("nc-more").onclick = () => {
    limit += 50;
    render();
  };
  q("nc-clear-recent").onclick = () =>
    run(() => updatePreferences((p) => ({ ...p, recent: [] })));
  q("nc-reset-prefs").onclick = () =>
    run(() => {
      localStorage.setItem(preferenceKey, JSON.stringify(P.parse(null)));
      readPreferences();
      limit = 50;
      q("nc-view").value = "all";
      q("nc-kind").value = "";
      q("nc-query").value = "";
      render();
      status(
        "View preferences reset. Saved templates and documents are unchanged.",
      );
    });
  window.addEventListener("storage", (event) => {
    if (event.key === preferenceKey || !event.key) {
      readPreferences();
      if (dialog.open) render();
    }
  });
  q("nc-close").onclick = () => dialog.close();
  q("nc-apply").onclick = () =>
    run(async () => {
      if (!pending) throw Error("Preview a candidate first.");
      if (adapter()?.isBusy?.())
        throw Error("Finish the active operation first.");
      if (JSON.stringify(await snapshot()) !== JSON.stringify(pending.before))
        throw Error(
          "The current content changed. Preview again before applying.",
        );
      if (app.id === "projectiX" && pending.entry.kind === "layout") {
        const scale = document.querySelector("#scale");
        scale.selectedIndex =
          pending.entry.id === "blue" ? 0 : scale.options.length - 1;
        scale.dispatchEvent(new Event("change", { bubbles: true }));
        status("Timeline view layout updated. Project tasks are unchanged.");
      } else if (app.id === "shelliX") {
        for (const [id, key] of [
          ["shell-command", "command"],
          ["cwd", "cwd"],
          ["timeout", "timeout"],
        ]) {
          const input = document.querySelector("#" + id);
          input.value = pending.value[key];
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        status("Snippet loaded into the command draft. No command was run.");
      } else {
        await adapter().apply(
          await adapter().validate(pending.value, pending.before),
        );
        status(
          "Native candidate applied. Use the app Undo control to restore the previous document.",
        );
      }
      pending = null;
      q("nc-apply").hidden = true;
    });
  q("nc-save").onclick = () =>
    run(async () => {
      if (!pending) throw Error("Preview a candidate first.");
      if (app.id === "projectiX" && pending.entry.kind === "layout")
        throw Error(
          "Timeline layouts are view preferences; save the project template separately.",
        );
      await SuiteTemplates.put(
        app.id,
        {
          name: pending.entry.name + " copy",
          description: "Editable catalogue copy",
          tags: ["catalogue", pending.entry.kind],
        },
        pending.value,
      );
      await saved();
      status("Editable copy saved in this app template/snippet library.");
    });
  q("nc-export").onclick = () => {
    if (!pending) return;
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(pending.value, null, 2)], {
          type: "application/json",
        }),
      ),
      a = el("a");
    a.href = url;
    a.download = app.id + "-" + pending.entry.id + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  async function saved() {
    records = await SuiteTemplates.list(app.id);
    render();
    q("nc-saved-list").replaceChildren();
    for (const record of records.slice(0, 50)) {
      const row = el("article");
      row.append(el("strong", record.name));
      const button = el("button", "Preview saved copy");
      button.onclick = () =>
        run(() =>
          preview(
            { id: "saved-" + record.id, name: record.name, kind: "template" },
            record.document,
          ),
        );
      row.append(button);
      q("nc-saved-list").append(row);
    }
    if (!records.length)
      q("nc-saved-list").append(el("p", "No saved native templates yet."));
    else if (records.length > 50)
      q("nc-saved-list").append(
        el(
          "p",
          "Showing the first 50 saved copies. Search or browse the paged main catalogue for all entries.",
        ),
      );
  }
  q("nc-refresh-saved").onclick = () => run(saved);
  q("nc-saved").addEventListener("toggle", () => {
    if (q("nc-saved").open) run(saved);
  });
  q("nc-save-current").onclick = () =>
    run(async () => {
      const name = q("nc-copy-name").value.trim();
      if (!name) throw Error("Name the edited template before saving.");
      if (adapter()?.isBusy?.())
        throw Error("Finish the active operation first.");
      const doc = await snapshot();
      if (app.id === "shelliX" && !doc.command.trim())
        throw Error("Enter a command draft before saving a snippet.");
      await SuiteTemplates.put(
        app.id,
        {
          name,
          description: "Native editable catalogue variant",
          tags: ["catalogue", "custom"],
        },
        doc,
      );
      await saved();
      status(
        "Current content saved as a new native template. The document is unchanged.",
      );
    });
  window.SuiteCatalogue = {
    open: () =>
      run(async () => {
        if (!seeds) {
          const r = await fetch(
            new URL("shared-suite/catalogue/seeds.json", base),
          );
          if (!r.ok) throw Error("Could not load native catalogue examples.");
          seeds = await r.json();
        }
        q("nc-title").textContent = app.name + " · Templates & layouts";
        readPreferences();
        limit = 50;
        try {
          await saved();
        } catch (error) {
          records = [];
          render();
          status(
            "Saved templates are unavailable: " +
              error.message +
              " Built-in entries remain available.",
          );
        }
        if (!dialog.open) dialog.showModal();
      }),
  };
})();
