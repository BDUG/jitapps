(function () {
  "use strict";
  if (window.SuiteTaskBoard) return;
  const base = new URL("../", document.currentScript.src),
    C = SuiteTaskBoardCore,
    apps = SuiteApps,
    current = apps.find((a) =>
      location.pathname.startsWith(new URL(a.id + "/", base).pathname),
    );
  let data = { books: [], errors: [] },
    rows = [],
    chosen = new Set(),
    limit = 100,
    storageNotice = "";
  const el = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const style = el("link");
  style.rel = "stylesheet";
  style.href = new URL(
    "shared-suite/task-board.css?v=worklists-20261031",
    base,
  ).href;
  document.head.append(style);
  const dialog = el("dialog");
  dialog.id = "suite-task-board";
  dialog.setAttribute("aria-labelledby", "tb-title");
  dialog.innerHTML = `<header><div><h2 id="tb-title">Tasks across your apps</h2><p>Saved browser notebooks · task status does not certify completed work</p></div><button id="tb-close" aria-label="Close task dashboard">×</button></header><div class="tb-filters"><label>Find work<input id="tb-query" type="search" placeholder="Tasks, notes, project titles…"></label><label>App<select id="tb-app"><option value="">All apps</option></select></label><label>Status<select id="tb-filter"><option value="open">Unfinished</option><option value="done">Completed</option><option value="all">All tasks</option></select></label></div><p id="tb-count" role="status"></p><div class="tb-actions"><button id="tb-add">Add task</button><button id="tb-refresh">Refresh</button><button id="tb-notes">Current app notes</button><button id="tb-select">Select filtered tasks</button><button id="tb-clear">Clear selection</button><button id="tb-ai">Draft AI brief</button><button id="tb-export">Export filtered Markdown</button><button id="tb-worklist">Export selected JSON</button><button id="tb-import">Import worklist</button><input id="tb-file" type="file" accept=".json,application/json" hidden></div><div id="tb-list"></div><button id="tb-more" hidden>Show 100 more</button><p id="tb-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const q = (id) => dialog.querySelector("#" + id);
  for (const app of apps) {
    const option = el("option", app.name);
    option.value = app.id;
    q("tb-app").append(option);
  }
  q("tb-notes").disabled = !current;
  function status(message) {
    q("tb-status").textContent = message;
  }
  const editor = el("dialog");
  editor.id = "suite-task-editor";
  editor.setAttribute("aria-labelledby", "te-title");
  editor.innerHTML = `<h2 id="te-title">Add task</h2><p>Saved in the app notebook on this browser. App documents are unchanged.</p><label>App<select id="te-app"></select></label><label>Task<textarea id="te-text" rows="5" maxlength="5000"></textarea></label><p id="te-context"></p><div class="tb-actions"><button id="te-save">Save task</button><button id="te-cancel">Cancel</button></div><p id="te-status" role="status" aria-live="polite"></p>`;
  document.body.append(editor);
  const e = (id) => editor.querySelector("#" + id);
  let editing = null;
  for (const app of apps) {
    const option = el("option", app.name);
    option.value = app.id;
    e("te-app").append(option);
  }
  function captureTarget() {
    const tool = e("te-app").value,
      raw = localStorage.getItem(C.key(tool));
    let doc;
    try {
      doc =
        raw === null
          ? SuiteNotebookCore.empty(tool)
          : SuiteNotebookCore.validate(JSON.parse(raw));
    } catch {
      throw Error(
        "This app's saved notebook is unreadable. Choose another app or repair its notebook in Notes & tasks.",
      );
    }
    if (doc.tool !== tool) throw Error("Notebook belongs to another app.");
    editing = {
      tool,
      raw,
      id: editing?.create ? editing.id : crypto.randomUUID(),
      create: true,
    };
    e("te-context").textContent =
      doc.title +
      " · " +
      doc.tasks.length +
      " existing tasks. Notes and completion flags will be preserved.";
  }
  function taskEditor(row) {
    editing = null;
    e("te-status").textContent = "";
    e("te-save").disabled = false;
    try {
      if (row) {
        const book = data.books.find((b) => b.app.id === row.tool);
        if (localStorage.getItem(C.key(row.tool)) !== book.raw)
          throw Error(
            "This notebook changed. Refresh before editing the task.",
          );
        editing = {
          tool: row.tool,
          raw: book.raw,
          id: row.task.id,
          create: false,
        };
        e("te-app").value = row.tool;
        e("te-text").value = row.task.text;
        e("te-context").textContent =
          book.doc.title +
          " · " +
          (row.task.done ? "Completed" : "Unfinished") +
          ". Editing text preserves the completion flag.";
      } else {
        editing = { id: crypto.randomUUID(), create: true };
        e("te-app").value = q("tb-app").value || current?.id || apps[0].id;
        e("te-text").value = "";
        try {
          captureTarget();
        } catch (error) {
          editing = null;
          e("te-save").disabled = true;
          e("te-context").textContent =
            "Choose another app or repair the saved notebook before adding tasks.";
          e("te-status").textContent = error.message;
        }
      }
      e("te-app").disabled = !!row;
      e("te-title").textContent = row ? "Edit task" : "Add task";
      if (!editor.open) editor.showModal();
      e("te-text").focus();
    } catch (error) {
      status(error.message);
    }
  }
  e("te-app").onchange = () => {
    try {
      captureTarget();
      e("te-save").disabled = false;
      e("te-status").textContent = "";
    } catch (error) {
      editing = null;
      e("te-save").disabled = true;
      e("te-status").textContent = error.message;
    }
  };
  e("te-cancel").onclick = () => editor.close();
  e("te-save").onclick = () => {
    try {
      if (!editing) throw Error("Reopen the task editor and choose an app.");
      const key = C.key(editing.tool),
        raw = C.saveTask(editing.tool, localStorage.getItem(key), editing.raw, {
          id: editing.id,
          text: e("te-text").value,
          create: editing.create,
        });
      localStorage.setItem(key, raw);
      editor.close();
      read();
      status(
        "Task saved to " +
          apps.find((a) => a.id === editing.tool).name +
          ". App documents are unchanged. Open notebook drafts will detect this saved change.",
      );
    } catch (error) {
      e("te-status").textContent = error.message;
    }
  };
  q("tb-add").onclick = () => taskEditor();
  function render() {
    const focused = document.activeElement,
      focusKey = focused?.closest("#tb-list article")?.dataset.task,
      focusKind = focused?.getAttribute("aria-label")?.startsWith("Select ")
        ? 0
        : 1;
    rows = C.search(data.books, {
      query: q("tb-query").value,
      tool: q("tb-app").value,
      status: q("tb-filter").value,
    });
    const all = data.books.flatMap((b) => b.doc.tasks);
    q("tb-count").textContent =
      rows.length +
      " matching tasks · " +
      all.filter((t) => !t.done).length +
      " unfinished across " +
      data.books.length +
      " notebooks · " +
      chosen.size +
      " selected";
    q("tb-list").replaceChildren();
    for (const row of rows.slice(0, limit)) {
      const item = el("article");
      item.dataset.task = row.key;
      const select = el("input");
      select.type = "checkbox";
      select.checked = chosen.has(row.key);
      select.setAttribute("aria-label", "Select " + row.task.text);
      select.onchange = () => {
        if (select.checked) chosen.add(row.key);
        else chosen.delete(row.key);
        render();
      };
      const text = el("div"),
        heading = el("strong", row.task.text),
        context = el("small", row.app + " · " + row.title),
        visit = el("a", "Open " + row.app);
      visit.href = new URL(row.tool + "/", base).href;
      const edit = el("button", "Edit task");
      edit.setAttribute("aria-label", "Edit " + row.task.text);
      edit.onclick = () => taskEditor(row);
      text.append(heading, context, visit, edit);
      const label = el("label", "Done "),
        complete = el("input");
      complete.type = "checkbox";
      complete.checked = row.task.done;
      complete.setAttribute("aria-label", "Complete " + row.task.text);
      complete.onchange = () => {
        try {
          const book = data.books.find((b) => b.app.id === row.tool),
            key = C.key(row.tool),
            raw = C.toggle(
              book,
              row.task.id,
              complete.checked,
              localStorage.getItem(key),
            );
          localStorage.setItem(key, raw);
          read();
          status("Task status saved. App documents are unchanged.");
        } catch (error) {
          complete.checked = row.task.done;
          status(error.message);
        }
      };
      label.append(complete);
      item.append(select, text, label);
      q("tb-list").append(item);
    }
    if (!rows.length)
      q("tb-list").append(
        el(
          "p",
          data.books.length
            ? "No matching tasks. Add tasks in an app notebook or change the filters."
            : "No saved notebooks yet. Open an app and use Current app notes to create a checklist.",
        ),
      );
    q("tb-more").hidden = rows.length <= limit;
    q("tb-ai").disabled = !chosen.size;
    q("tb-clear").disabled = !chosen.size;
    q("tb-worklist").disabled = !chosen.size;
    if (focusKey) {
      const row = [...q("tb-list").querySelectorAll("article")].find(
          (row) => row.dataset.task === focusKey,
        ),
        target = row?.querySelectorAll("input")[focusKind];
      if (target) target.focus({ preventScroll: true });
      else {
        q("tb-count").tabIndex = -1;
        q("tb-count").focus({ preventScroll: true });
      }
    }
  }
  function read() {
    data = C.collect(apps, (key) => localStorage.getItem(key));
    const valid = new Set(
      data.books.flatMap((b) =>
        b.doc.tasks.map((t) => C.identity(b.app.id, t.id)),
      ),
    );
    chosen = new Set([...chosen].filter((key) => valid.has(key)));
    render();
    status(
      [storageNotice, ...data.errors.map((e) => e.tool + ": " + e.message)]
        .filter(Boolean)
        .join("\n"),
    );
  }
  async function script(name) {
    if (document.querySelector('script[data-task-load="' + name + '"]')) return;
    const tag = el("script");
    tag.dataset.taskLoad = name;
    tag.src = new URL("shared-suite/" + name + "?v=20261031", base).href;
    await new Promise((resolve, reject) => {
      tag.onload = resolve;
      tag.onerror = () => {
        tag.remove();
        reject(Error("Could not load " + name));
      };
      document.head.append(tag);
    });
  }
  q("tb-notes").onclick = async () => {
    try {
      if (!window.SuiteNotebook) await script("notebook.js");
      if (!window.SuiteNotebook)
        throw Error("Notes are not ready. Refresh this page and retry.");
      dialog.close();
      SuiteNotebook.open();
    } catch (error) {
      status(error.message);
    }
  };
  q("tb-close").onclick = () => dialog.close();
  q("tb-refresh").onclick = () => {
    limit = 100;
    read();
  };
  for (const id of ["tb-query", "tb-app", "tb-filter"])
    q(id).addEventListener(id === "tb-query" ? "input" : "change", () => {
      limit = 100;
      render();
    });
  q("tb-more").onclick = () => {
    limit += 100;
    render();
  };
  q("tb-select").onclick = () => {
    for (const row of rows) chosen.add(row.key);
    render();
  };
  q("tb-clear").onclick = () => {
    chosen.clear();
    render();
  };
  q("tb-ai").onclick = () => {
    try {
      const selected = C.search(data.books, { status: "all" }).filter((r) =>
          chosen.has(r.key),
        ),
        brief = C.brief(selected),
        input = document.querySelector(
          current?.id === "codeiX"
            ? "#ag-goal"
            : current?.id === "shelliX"
              ? "#prompt"
              : "#sai-prompt",
        );
      if (!input || input.disabled || input.readOnly)
        throw Error(
          "Open an app with an available AI prompt to draft these tasks.",
        );
      if (
        (input.value + "\n\n" + brief).length >
        (input.maxLength > 0 ? input.maxLength : 100000)
      )
        throw Error(
          "The current AI draft is too long. Select fewer tasks or shorten the draft.",
        );
      if (
        current?.id === "shelliX" &&
        document.querySelector("#agent-input")?.hidden
      ) {
        window.ShelliXTerminal?.mode("agent", false);
        if (document.querySelector("#agent-input")?.hidden)
          throw Error(
            "Finish the active shell operation before opening the agent composer.",
          );
      }
      dialog.close();
      if (
        current?.id === "codeiX" &&
        document.body.classList.contains("agent-hidden")
      )
        document.querySelector("#toggleAgent")?.click();
      if (
        current?.id !== "shelliX" &&
        current?.id !== "codeiX" &&
        document.querySelector("#sai-panel")?.hidden
      )
        document.querySelector("#sai-launch")?.click();
      input.value += (input.value.trim() ? "\n\n" : "") + brief;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    } catch (error) {
      status(error.message);
    }
  };
  q("tb-export").onclick = () => {
    const blob = new Blob([C.markdown(rows)], { type: "text/markdown" }),
      url = URL.createObjectURL(blob),
      a = el("a");
    a.href = url;
    a.download = "suite-work-list.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  q("tb-worklist").onclick = () => {
    try {
      const rows = C.search(data.books, { status: "all" }).filter((r) =>
          chosen.has(r.key),
        ),
        packet = C.worklist(rows),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(packet)], { type: "application/json" }),
        ),
        a = el("a");
      a.href = url;
      a.download = "suite-selected-worklist.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status("Selected worklist exported. Review task text before sharing.");
    } catch (error) {
      status(error.message);
    }
  };
  const importer = el("dialog");
  importer.id = "suite-worklist-import";
  importer.setAttribute("aria-labelledby", "wi-title");
  importer.innerHTML = `<h2 id="wi-title">Import worklist</h2><p>Copy tasks into one app notebook. Tasks with identical text are skipped, preserving their existing completion flags. Imported completion flags are notes, not verification.</p><label>Destination app<select id="wi-app"></select></label><p id="wi-count"></p><ol id="wi-preview"></ol><button id="wi-apply">Import reviewed tasks</button><button id="wi-cancel">Cancel</button><p id="wi-status" role="status" aria-live="polite"></p>`;
  document.body.append(importer);
  const w = (id) => importer.querySelector("#" + id);
  let pendingImport = null,
    importSerial = 0;
  for (const app of apps) {
    const option = el("option", app.name);
    option.value = app.id;
    w("wi-app").append(option);
  }
  function previewImport() {
    w("wi-apply").disabled = true;
    try {
      if (!pendingImport) throw Error("Choose a worklist file first.");
      const tool = w("wi-app").value,
        raw = localStorage.getItem(C.key(tool));
      let plan;
      try {
        plan = C.importWorklist(pendingImport.packet, tool, raw);
      } catch {
        throw Error(
          "This app notebook cannot accept the worklist. Choose another app or repair its saved notes.",
        );
      }
      pendingImport = { packet: pendingImport.packet, tool, raw, plan };
      w("wi-count").textContent =
        plan.added +
        " tasks to add · " +
        plan.skipped +
        " identical-text tasks skipped · " +
        pendingImport.packet.tasks.length +
        " source tasks. Showing the first 20 source tasks.";
      w("wi-preview").replaceChildren();
      for (const row of pendingImport.packet.tasks.slice(0, 20))
        w("wi-preview").append(
          el(
            "li",
            row.tool +
              " · " +
              row.title +
              " · " +
              (row.task.done ? "Completed: " : "Unfinished: ") +
              row.task.text,
          ),
        );
      w("wi-apply").disabled = !plan.added;
      w("wi-status").textContent =
        "Review before importing. Existing notes, titles and tasks will be preserved.";
    } catch (error) {
      w("wi-status").textContent = error.message;
    }
  }
  q("tb-import").onclick = () => {
    q("tb-file").value = "";
    q("tb-file").click();
  };
  q("tb-file").onchange = async () => {
    const file = q("tb-file").files[0];
    if (!file) return;
    const serial = ++importSerial;
    try {
      if (file.size > 1000000) throw Error("Worklists are limited to 1 MB.");
      let decoded;
      try {
        decoded = JSON.parse(await file.text());
      } catch {
        throw Error("Choose a valid suite worklist JSON file.");
      }
      const packet = C.validateWorklist(decoded);
      if (serial !== importSerial) return;
      pendingImport = { packet };
      w("wi-app").value = q("tb-app").value || current?.id || apps[0].id;
      previewImport();
      if (!importer.open) importer.showModal();
    } catch (error) {
      status(error.message);
    }
  };
  w("wi-app").onchange = previewImport;
  function closeImport() {
    pendingImport = null;
    importSerial++;
    importer.close();
  }
  w("wi-cancel").onclick = closeImport;
  importer.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeImport();
  });
  w("wi-apply").onclick = () => {
    try {
      if (!pendingImport?.plan || pendingImport.tool !== w("wi-app").value)
        throw Error("Preview the destination before importing.");
      if (localStorage.getItem(C.key(pendingImport.tool)) !== pendingImport.raw)
        throw Error(
          "The destination notebook changed. Choose the destination again to refresh the preview.",
        );
      localStorage.setItem(
        C.key(pendingImport.tool),
        JSON.stringify(pendingImport.plan.doc),
      );
      const added = pendingImport.plan.added;
      closeImport();
      read();
      status(
        added +
          " tasks imported. Documents and existing notebook drafts are unchanged.",
      );
    } catch (error) {
      w("wi-status").textContent = error.message;
    }
  };

  window.addEventListener("storage", (event) => {
    if (
      dialog.open &&
      (!event.key || event.key.startsWith("suite-notebook-v1:"))
    ) {
      storageNotice =
        "Saved notebooks changed in another window; the dashboard has refreshed.";
      read();
    }
  });
  dialog.addEventListener("close", () => {
    chosen.clear();
  });
  window.SuiteTaskBoard = {
    open: () => {
      storageNotice = "";
      limit = 100;
      read();
      if (!dialog.open) dialog.showModal();
      q("tb-query").focus();
    },
  };
})();
