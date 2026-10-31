(function () {
  "use strict";
  function setup() {
    if (window.SuiteNotebook || document.getElementById("suite-notebook")) return;
    const N = window.SuiteNotebookCore,
      tool =
        window.SuiteWorkspaceAdapter?.name ||
        (window.SuiteApps || []).find(app => location.pathname.includes("/" + app.id + "/"))?.id;
    if (!N || !tool) return;
    const key = "suite-notebook-v1:" + tool,
      make = (tag, text) => {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        return e;
      };
    let doc = N.empty(tool),
      saved = null,
      pending = null,
      dirty = false,
      storageError = "";
    try {
      saved = localStorage.getItem(key);
      if (saved) doc = N.validate(JSON.parse(saved));
    } catch (error) {
      storageError = error.message;
    }
    const launch = make("button", "Notes & tasks");
    launch.id = "suite-notebook-open";
    launch.type = "button";
    const host =
      document.querySelector("#sw-commands") ||
      document.querySelector("#shell-workspace-actions") ||
      document.querySelector("#suite-tools");
    if (!host) return;
    // Shell action search rebuilds its list; keep this entry outside that dynamic container.
    if (tool === "shelliX") host.before(launch);
    else host.prepend(launch);
    const modal = make("dialog");
    modal.id = "suite-notebook";
    modal.className = "sd-dialog";
    modal.setAttribute("aria-labelledby", "nb-heading");
    modal.innerHTML =
      '<div class="sd-heading"><h2 id="nb-heading">Notes & tasks</h2><button type="button" id="nb-close" aria-label="Close notes and tasks">×</button></div><p id="nb-scope"></p><label>Notebook title<input id="nb-title"></label><label>Notes<textarea id="nb-notes" rows="6"></textarea></label><form id="nb-add"><label>New task<input id="nb-task" required></label><button>Add task</button></form><p id="nb-count"></p><div id="nb-tasks"></div><div class="nb-actions"><button type="button" id="nb-save">Save notes</button><button type="button" id="nb-reload">Reload saved notes</button><label>Export destination<select id="nb-destination"><option value="computer">Computer</option><option value="disk">Virtual disk</option></select></label><button type="button" id="nb-json">Export JSON</button><button type="button" id="nb-markdown">Export Markdown</button><button type="button" id="nb-import">Import notebook</button><input id="nb-file" type="file" accept=".json,application/json" data-disk-label="Workspace notebook" hidden><button type="button" id="nb-draft">Draft AI request</button></div><section id="nb-preview" hidden><h3>Import preview</h3><p id="nb-import-summary"></p><label>Import policy<select id="nb-policy"><option value="merge">Merge notes and tasks</option><option value="replace">Replace notebook</option></select></label><button type="button" id="nb-apply">Apply notebook import</button><button type="button" id="nb-discard">Discard import</button></section><p id="nb-status" role="status"></p>';
    document.body.append(modal);
    const q = (id) => modal.querySelector("#" + id);
    q("nb-scope").textContent =
      "Saved for " +
      tool +
      " in this browser, shared across this app’s projects. Export a copy for backup. Notes do not change the document.";
    const css = make("link");
    css.rel = "stylesheet";
    css.href = new URL(
      "notebook.css",
      document.querySelector('script[src*="shared-suite/notebook.js"]').src,
    ).href;
    document.head.append(css);
    function status(text) {
      q("nb-status").textContent = text;
    }
    function changed() {
      dirty = true;
      status("Unsaved notebook changes.");
    }
    function capture() {
      return N.validate({
        ...doc,
        title: q("nb-title").value,
        notes: q("nb-notes").value,
      });
    }
    const taskViews = new Map();
    function countTasks() {
      q("nb-count").textContent =
        doc.tasks.filter((task) => !task.done).length +
        " unfinished / " +
        doc.tasks.length +
        " tasks";
    }
    function taskLabels(view) {
      view.check.setAttribute("aria-label", "Complete task " + view.task.text);
      view.remove.setAttribute("aria-label", "Remove task " + view.task.text);
    }
    function taskView(task) {
      let view = taskViews.get(task.id);
      if (!view) {
        const row = make("div"),
          label = make("label"),
          check = make("input"),
          text = make("input"),
          remove = make("button", "Remove");
        row.className = "nb-task-row";
        check.type = "checkbox";
        text.setAttribute("aria-label", "Task text");
        remove.type = "button";
        label.append(check);
        row.append(label, text, remove);
        view = { row, check, text, remove, task };
        taskViews.set(task.id, view);
        check.onchange = () => {
          view.task.done = check.checked;
          changed();
          countTasks();
        };
        text.oninput = () => {
          view.task.text = text.value;
          taskLabels(view);
          changed();
        };
        remove.onclick = () => {
          doc.title = q("nb-title").value;
          doc.notes = q("nb-notes").value;
          const index = doc.tasks.findIndex((task) => task.id === view.task.id);
          doc.tasks = doc.tasks.filter((task) => task.id !== view.task.id);
          render();
          changed();
          const next = doc.tasks[Math.min(index, doc.tasks.length - 1)];
          (next ? taskViews.get(next.id).text : q("nb-task")).focus();
        };
      }
      view.task = task;
      view.check.checked = task.done;
      if (view.text.value !== task.text) view.text.value = task.text;
      taskLabels(view);
      return view.row;
    }
    function render() {
      q("nb-title").value = doc.title;
      q("nb-notes").value = doc.notes;
      countTasks();
      const list = q("nb-tasks"),
        ids = new Set(doc.tasks.map((task) => task.id));
      for (const [id, view] of taskViews)
        if (!ids.has(id)) {
          view.row.remove();
          taskViews.delete(id);
        }
      doc.tasks.forEach((task, index) => {
        const row = taskView(task);
        if (list.children[index] !== row)
          list.insertBefore(row, list.children[index] || null);
      });
    }

    function guard(fn) {
      try {
        fn();
      } catch (error) {
        status(error.message);
      }
    }
    function persist(value) {
      const current = localStorage.getItem(key);
      if (current !== saved)
        throw Error(
          "Notebook changed in another tab. Export your draft, then use Reload saved notes to load the newer copy.",
        );
      const serialized = JSON.stringify(N.validate(value));
      localStorage.setItem(key, serialized);
      saved = serialized;
      doc = N.validate(value);
      dirty = false;
    }
    function open() {
      q("nb-destination").value =
        window.SuiteDiskUI?.getDestination() || "computer";
      if (!dirty) {
        try {
          saved = localStorage.getItem(key);
          doc = saved ? N.validate(JSON.parse(saved)) : N.empty(tool);
          storageError = "";
        } catch (error) {
          storageError = error.message;
        }
      }
      if (!dirty) render();
      if (!modal.open) modal.showModal();
      status(
        storageError ||
          (dirty ? "Unsaved notebook changes." : "Notebook ready."),
      );
      q("nb-title").focus();
    }
    launch.onclick = open;
    q("nb-close").onclick = () => {
      if (
        dirty &&
        !confirm(
          "Close with unsaved notes? Your draft stays here until this page reloads.",
        )
      )
        return;
      modal.close();
    };
    modal.addEventListener("cancel", (event) => {
      if (
        dirty &&
        !confirm(
          "Close with unsaved notes? Your draft stays here until this page reloads.",
        )
      )
        event.preventDefault();
    });
    modal.addEventListener("keydown", (event) => event.stopPropagation());
    q("nb-title").oninput = q("nb-notes").oninput = changed;
    q("nb-add").onsubmit = (event) => {
      event.preventDefault();
      guard(() => {
        const text = q("nb-task").value.trim();
        if (!text) return;
        doc = capture();
        doc.tasks.push({ id: crypto.randomUUID(), text, done: false });
        q("nb-task").value = "";
        render();
        changed();
        q("nb-task").focus();
      });
    };
    q("nb-reload").onclick = () =>
      guard(() => {
        if (
          dirty &&
          !confirm(
            "Discard this unsaved notebook draft and reload saved notes?",
          )
        )
          return;
        const current = localStorage.getItem(key),
          next = current ? N.validate(JSON.parse(current)) : N.empty(tool);
        doc = next;
        saved = current;
        dirty = false;
        render();
        status("Loaded saved notebook.");
      });
    q("nb-save").onclick = () =>
      guard(() => {
        persist(capture());
        render();
        status("Notebook saved in this browser.");
      });
    function download(text, name, type) {
      const url = URL.createObjectURL(new Blob([text], { type })),
        a = make("a");
      a.href = url;
      a.download = name;
      if (window.SuiteDiskUI) SuiteDiskUI.download(a);
      else a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    q("nb-destination").onchange = () =>
      guard(() => {
        if (!window.SuiteDiskUI) throw Error("File storage is unavailable.");
        SuiteDiskUI.setDestination(q("nb-destination").value);
      });
    q("nb-json").onclick = () =>
      guard(() =>
        download(
          JSON.stringify(capture(), null, 2),
          tool + ".notebook.json",
          "application/json",
        ),
      );
    q("nb-markdown").onclick = () =>
      guard(() =>
        download(N.markdown(capture()), tool + ".notebook.md", "text/markdown"),
      );
    q("nb-import").onclick = () => q("nb-file").click();
    let importSequence = 0;
    function discardImport() {
      importSequence++;
      pending = null;
      q("nb-file").value = "";
      q("nb-preview").hidden = true;
      q("nb-preview").setAttribute("aria-busy", "false");
      q("nb-apply").disabled = true;
    }
    modal.addEventListener("close", discardImport);
    q("nb-file").onchange = async () => {
      const file = q("nb-file").files[0];
      if (!file) return;
      const ticket = ++importSequence;
      pending = null;
      q("nb-preview").hidden = false;
      q("nb-preview").setAttribute("aria-busy", "true");
      q("nb-apply").disabled = true;
      q("nb-import-summary").textContent = "Reading " + file.name + "…";
      status("Reading notebook. Discard cancels this preview.");
      try {
        const text = await file.text();
        if (ticket !== importSequence) return;
        pending = N.validate(JSON.parse(text));
        q("nb-import-summary").textContent =
          pending.title +
          " · " +
          pending.tool +
          " · " +
          pending.tasks.length +
          " tasks · " +
          pending.notes.length +
          " note characters. No changes applied yet.";
        q("nb-apply").disabled = false;
        status("Review the import policy before applying.");
      } catch (error) {
        if (ticket !== importSequence) return;
        pending = null;
        q("nb-preview").hidden = true;
        status(error.message);
      } finally {
        if (ticket === importSequence) {
          q("nb-file").value = "";
          q("nb-preview").setAttribute("aria-busy", "false");
        }
      }
    };
    q("nb-discard").onclick = () => {
      discardImport();
      status("Import discarded.");
    };
    q("nb-apply").onclick = () =>
      guard(() => {
        if (!pending) throw Error("Choose a notebook first.");
        const next =
          q("nb-policy").value === "replace"
            ? { ...pending, tool }
            : N.merge(capture(), pending);
        persist(next);
        render();
        discardImport();
        status("Notebook imported and saved. Document unchanged.");
      });
    q("nb-draft").onclick = () =>
      guard(() => {
        const d = capture();
        if (
          tool === "codeiX" &&
          window.SuiteWorkspaceAdapter?.snapshot()?.aiExcluded?.length
        )
          throw Error(
            "Review AI-excluded files before drafting a workspace request.",
          );
        const input = document.querySelector(
          tool === "codeiX"
            ? "#ag-goal"
            : tool === "shelliX"
              ? "#prompt"
              : "#sai-prompt",
        );
        if (!input || input.disabled || input.readOnly)
          throw Error(
            "Finish the active operation and open the AI chat before drafting.",
          );
        if (
          tool === "codeiX" &&
          document.body.classList.contains("agent-hidden")
        )
          document.querySelector("#toggleAgent")?.click();
        if (
          tool !== "shelliX" &&
          tool !== "codeiX" &&
          document.querySelector("#sai-panel")?.hidden
        )
          document.querySelector("#sai-launch")?.click();
        if (tool === "shelliX" && document.querySelector("#agent-input")?.hidden) {
          window.ShelliXTerminal?.mode("agent", false);
          if (document.querySelector("#agent-input")?.hidden) throw Error("Finish the active shell operation before opening the agent composer.");
        }
        const reference = { ...d, tasks: d.tasks.filter((t) => !t.done) };
        input.value +=
          (input.value.trim() ? "\n\n" : "") +
          "Use these workspace notes as reference data. Help plan the unfinished tasks; ask about missing requirements and preserve existing content. Do not assume a checked task proves successful verification.\n" +
          N.markdown(reference);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        status(
          "AI request drafted. Review it before sending; no request was sent.",
        );
        modal.close();
        document.querySelector("#suite-workspace[open]")?.close();
        document.querySelector("#shell-workspace[open]")?.close();
        input.focus();
      });
    window.SuiteNotebook = { open };
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
})();
