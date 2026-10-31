(function () {
  "use strict";
  const A = window.SuiteWorkspaceAdapter,
    W = window.SuiteWorkspace,
    T = window.SuiteTemplates;
  if (!A || !W || !T) return;
  const modal = document.querySelector("#suite-workspace"),
    make = (tag, text) => {
      const n = document.createElement(tag);
      if (text !== undefined) n.textContent = text;
      return n;
    },
    tab = make("button", "Templates");
  tab.type = "button";
  tab.dataset.panel = "templates";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", "false");
  tab.tabIndex = -1;
  tab.onclick = () => W.open("templates");
  modal.querySelector(".sw-tabs").append(tab);
  const panel = make("section");
  panel.id = "sw-templates";
  panel.className = "sw-panel";
  panel.setAttribute("role", "tabpanel");
  panel.hidden = true;
  panel.innerHTML =
    '<h3>Reusable document templates</h3><p>Save native starting points in this browser. Applying replaces the document through native review and recovery; it does not run scripts, code, commands or AI. Templates may contain embedded media, scripts and project settings. Inspect exports before sharing.</p><div class="sw-row"><input id="st-name" aria-label="Template name" placeholder="Template name"><input id="st-tags" aria-label="Template tags" placeholder="Tags, comma separated"></div><textarea id="st-description" aria-label="Template description" placeholder="When to use this template"></textarea><div class="sw-row"><button type="button" id="st-save">Save current as new template</button><button type="button" id="st-update" disabled>Update selected metadata</button><button type="button" id="st-import">Import template</button><input id="st-file" type="file" accept=".json,application/json" data-disk-label="Document template" hidden></div><div class="sw-row"><input id="st-query" type="search" aria-label="Search templates" placeholder="Search names, descriptions and tags"><button type="button" id="st-refresh">Refresh templates</button></div><p id="st-status" role="status"></p><div id="st-list" class="sw-list"></div>';
  modal.querySelector("#sw-review").before(panel);
  const q = (id) => panel.querySelector("#" + id);
  let selected = null,
    records = [],
    searchRows = [],
    serial = 0,
    page = 0,
    working = false;
  const pageSize = 25;
  const details = () => ({
    name: q("st-name").value,
    description: q("st-description").value,
    tags: q("st-tags").value,
  });
  function status(text) {
    q("st-status").textContent = text;
  }
  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      serial++;
      q("st-list").setAttribute("aria-busy", "false");
      q("st-refresh").disabled = false;
      status(e.message);
    }
  }
  const selectionLabel = make("p");
  selectionLabel.id = "st-selection";
  selectionLabel.setAttribute("role", "status");
  const clearSelection = make("button", "Clear template selection");
  clearSelection.type = "button";
  clearSelection.id = "st-clear-selection";
  q("st-description").after(selectionLabel, clearSelection);
  function controls() {
    panel.setAttribute("aria-busy", String(working));
    for (const id of [
      "st-save",
      "st-import",
      "st-file",
      "st-name",
      "st-tags",
      "st-description",
    ])
      q(id).disabled = working;
    q("st-update").disabled = working || !selected;
    const contentUpdate = panel.querySelector("#st-update-content");
    if (contentUpdate) contentUpdate.disabled = working || !selected;
    clearSelection.disabled = working || !selected;
    for (const button of q("st-list").querySelectorAll("button"))
      button.disabled = working;
    const record = records.find((record) => record.id === selected);
    selectionLabel.textContent = record
      ? "Editing template metadata: " + record.name
      : "No saved template selected. Save creates a new template.";
  }
  clearSelection.onclick = () => {
    if (working) return;
    selected = null;
    q("st-name").value = q("st-tags").value = q("st-description").value = "";
    controls();
    q("st-name").focus();
  };
  async function perform(fn) {
    if (working) return;
    working = true;
    controls();
    try {
      await run(fn);
    } finally {
      working = false;
      controls();
    }
  }
  async function validate(document) {
    if (A.isBusy()) throw Error("Finish the active operation first.");
    await A.validate(SuiteWorkspaceCore.copy(document), A.snapshot());
  }
  const paging = make("div");
  paging.className = "sw-row";
  paging.hidden = true;
  const previous = make("button", "Previous templates"),
    next = make("button", "Next templates"),
    range = make("span");
  previous.type = next.type = "button";
  previous.id = "st-prev";
  next.id = "st-next";
  range.id = "st-range";
  range.setAttribute("role", "status");
  paging.append(previous, range, next);
  q("st-list").before(paging);
  previous.onclick = () => {
    page = Math.max(0, page - 1);
    render();
    q("st-list").scrollTop = 0;
  };
  next.onclick = () => {
    page++;
    render();
    q("st-list").scrollTop = 0;
  };
  function render() {
    const query = q("st-query").value.toLocaleLowerCase(),
      rows = searchRows
        .filter((entry) => entry.text.includes(query))
        .map((entry) => entry.record);
    page = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
    paging.hidden = rows.length <= pageSize;
    previous.disabled = page === 0;
    next.disabled = (page + 1) * pageSize >= rows.length;
    range.textContent = rows.length
      ? page * pageSize +
        1 +
        "–" +
        Math.min((page + 1) * pageSize, rows.length) +
        " of " +
        rows.length +
        " templates"
      : "No matching templates";
    q("st-list").replaceChildren();
    for (const record of rows.slice(page * pageSize, (page + 1) * pageSize)) {
      const row = make("div");
      row.className = "sw-item";
      row.dataset.templateId = record.id;
      row.append(
        make("strong", record.name),
        make("p", record.description),
        make("small", record.tags.join(" · ")),
      );
      const actions = make("div");
      actions.className = "sw-row";
      for (const [title, fn] of [
        [
          "Preview template",
          async () => {
            await validate(record.document);
            await W.review(record.document, "Apply template: " + record.name);
            status("Review document changes below before applying.");
          },
        ],
        ...(["textiX", "sheetiX"].includes(A.name)
          ? [
              [
                "Duplicate saved template",
                async () => {
                  await validate(record.document);
                  const duplicate = await T.put(
                    A.name,
                    {
                      name: record.name.slice(0, 110) + " copy",
                      description: record.description,
                      tags: record.tags,
                    },
                    record.document,
                  );
                  selected = duplicate.id;
                  q("st-name").value = duplicate.name;
                  q("st-description").value = duplicate.description;
                  q("st-tags").value = duplicate.tags.join(", ");
                  await refresh();
                  status(
                    "Template duplicated. Edit its metadata or contents independently; the current document is unchanged.",
                  );
                },
              ],
              [
                "Preview extend template",
                async () => {
                  if (!window.SuiteOfficeCatalogue)
                    throw Error("Wait for the office catalogue to load.");
                  const extended = SuiteOfficeCatalogue.extend(
                    A.name,
                    A.snapshot(),
                    record.document,
                  );
                  await validate(extended);
                  await W.review(
                    extended,
                    "Extend with saved template: " + record.name,
                  );
                  status("Review the extension below before applying.");
                },
              ],
              [
                "Edit template content",
                async () => {
                  selected = record.id;
                  q("st-name").value = record.name;
                  q("st-description").value = record.description;
                  q("st-tags").value = record.tags.join(", ");
                  controls();
                  await validate(record.document);
                  await W.review(
                    record.document,
                    "Edit saved template: " + record.name,
                  );
                  status(
                    "Apply this preview, edit the document in the native editor, then use Update selected template with current content.",
                  );
                },
              ],
            ]
          : []),
        [
          "Edit metadata",
          () => {
            selected = record.id;
            q("st-name").value = record.name;
            q("st-description").value = record.description;
            q("st-tags").value = record.tags.join(", ");
            q("st-update").disabled = false;
            controls();
          },
        ],
        [
          "Export template",
          () => {
            const url = URL.createObjectURL(
                new Blob([JSON.stringify(T.pack(record), null, 2)], {
                  type: "application/json",
                }),
              ),
              a = make("a");
            a.href = url;
            a.download = A.name + ".template.json";
            SuiteDiskUI.download(a);
            setTimeout(() => URL.revokeObjectURL(url), 30000);
          },
        ],
        [
          "Delete saved template",
          async () => {
            await T.remove(record.id, A.name);
            if (selected === record.id) {
              selected = null;
              q("st-update").disabled = true;
            }
            await refresh();
            status(
              "Saved template deleted; the current document is unchanged.",
            );
          },
        ],
      ]) {
        const b = make("button", title);
        b.type = "button";
        b.onclick = () => perform(fn);
        actions.append(b);
      }
      row.append(actions);
      q("st-list").append(row);
    }
    if (!rows.length)
      q("st-list").append(
        make(
          "p",
          records.length
            ? "No templates match this search."
            : "No saved templates yet. Save the current document to create one.",
        ),
      );
    controls();
    status(
      rows.length + " of " + records.length + " templates for " + A.name + ".",
    );
  }
  async function refresh() {
    const ticket = ++serial;
    q("st-list").setAttribute("aria-busy", "true");
    q("st-refresh").disabled = true;
    status("Loading templates…");
    try {
      const values = await T.list(A.name);
      if (ticket !== serial) return;
      records = values;
      searchRows = records.map((record) => ({
        record,
        text: (
          record.name +
          " " +
          record.description +
          " " +
          record.tags.join(" ")
        ).toLocaleLowerCase(),
      }));
      if (selected && !records.some((record) => record.id === selected)) {
        selected = null;
        q("st-update").disabled = true;
      }
      render();
    } finally {
      if (ticket === serial) {
        q("st-list").setAttribute("aria-busy", "false");
        q("st-refresh").disabled = false;
      }
    }
  }
  q("st-save").onclick = () =>
    perform(async () => {
      const document = A.snapshot(),
        metadata = details();
      await validate(document);
      await T.put(A.name, metadata, document);
      await refresh();
    });
  if (["textiX", "sheetiX"].includes(A.name)) {
    const contentUpdate = make(
      "button",
      "Update selected template with current content",
    );
    contentUpdate.id = "st-update-content";
    contentUpdate.type = "button";
    q("st-update").after(contentUpdate);
    contentUpdate.onclick = () =>
      perform(async () => {
        if (!selected)
          throw Error(
            "Choose Edit metadata on the saved template you want to update.",
          );
        const current = A.snapshot();
        await validate(current);
        await T.edit(selected, A.name, details(), current);
        await refresh();
        status(
          "Selected template content updated from the current document. Other templates are unchanged.",
        );
      });
  }
  q("st-update").onclick = () =>
    perform(async () => {
      if (!selected) throw Error("Choose Edit metadata on a saved template.");
      await T.edit(selected, A.name, details());
      await refresh();
    });
  q("st-query").oninput = () => {
    page = 0;
    render();
  };
  q("st-refresh").onclick = () => run(refresh);
  q("st-import").onclick = () => q("st-file").click();
  q("st-file").onchange = () =>
    perform(async () => {
      try {
        const file = q("st-file").files[0];
        if (!file) return;
        const value = T.unpack(JSON.parse(await file.text()), A.name);
        await validate(value.document);
        await T.put(A.name, value, value.document);
        await refresh();
      } finally {
        q("st-file").value = "";
      }
    });
  new MutationObserver(() => {
    if (!panel.hidden) run(refresh);
  }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  run(refresh);
})();
