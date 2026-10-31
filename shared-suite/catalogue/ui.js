(function () {
  "use strict";
  if (window.SuiteCatalogue) return;
  const base = new URL("../../", document.currentScript.src),
    app = SuiteApps.find((a) =>
      location.pathname.startsWith(new URL(a.id + "/", base).pathname),
    ),
    C = SuiteNativeCatalogue,
    el = (t, text) => {
      const n = document.createElement(t);
      if (text !== undefined) n.textContent = text;
      return n;
    };
  if (!app) return;
  const style = el("link");
  style.rel = "stylesheet";
  style.href = new URL("shared-suite/catalogue/style.css?v=20261031", base);
  document.head.append(style);
  const dialog = el("dialog");
  dialog.id = "suite-native-catalogue";
  dialog.setAttribute("aria-labelledby", "nc-title");
  dialog.innerHTML =
    '<header><h2 id="nc-title">Templates & layouts</h2><button id="nc-close" aria-label="Close catalogue">×</button></header><p>Editable native starting points and layout themes. Templates replace content; layouts restyle or arrange current content. Preview before applying. Preparing catalogue entries uses no AI or terminal commands.</p><label>Find<input id="nc-query" type="search" placeholder="Template or layout name"></label><div id="nc-list"></div><details id="nc-preview" hidden><summary>Inspect complete native candidate</summary><pre id="nc-json"></pre></details><div><button id="nc-apply" hidden>Use reviewed candidate</button><button id="nc-save" disabled>Save editable copy</button><button id="nc-export" disabled>Export candidate JSON</button></div><details id="nc-saved"><summary>My saved native templates</summary><label>Copy name<input id="nc-copy-name" maxlength="120" placeholder="Name your edited template"></label><button id="nc-save-current">Save current as new template</button><button id="nc-refresh-saved">Refresh saved templates</button><div id="nc-saved-list"></div></details><p id="nc-status" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const q = (id) => dialog.querySelector("#" + id);
  let seeds = null,
    pending = null,
    busy = false;
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
    } else {
      q("nc-preview").open = true;
      status(
        "Review the native candidate. Use reviewed candidate applies it; shell snippets only load into the command draft.",
      );
    }
  }
  function render() {
    q("nc-list").replaceChildren();
    const term = q("nc-query").value.toLowerCase();
    for (const entry of C.entries(app.id).filter((e) =>
      (e.name + " " + e.kind + " " + e.description)
        .toLowerCase()
        .includes(term),
    )) {
      const article = el("article");
      article.append(
        el("strong", entry.name + " · " + entry.kind),
        el("p", entry.description),
      );
      const b = el("button", "Preview " + entry.name);
      b.onclick = () => run(() => preview(entry));
      article.append(b);
      q("nc-list").append(article);
    }
    if (!q("nc-list").children.length)
      q("nc-list").append(el("p", "No catalogue entries match this search."));
  }
  q("nc-query").oninput = render;
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
    const records = await SuiteTemplates.list(app.id);
    q("nc-saved-list").replaceChildren();
    for (const record of records) {
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
        render();
        if (!dialog.open) dialog.showModal();
      }),
  };
})();
