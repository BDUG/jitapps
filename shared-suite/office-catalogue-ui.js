(function () {
  "use strict";
  const A = window.SuiteWorkspaceAdapter,
    W = window.SuiteWorkspace,
    T = window.SuiteTemplates,
    C = window.SuiteOfficeCatalogue;
  if (!A || !W || !T || !["textiX", "sheetiX"].includes(A.name)) return;
  const catalog = A.name === "textiX" ? TextixCatalogue : SheetixCatalogue,
    host = document.querySelector("#sw-templates"),
    make = (tag, text) => {
      const e = document.createElement(tag);
      if (text !== undefined) e.textContent = text;
      return e;
    };
  let custom = [],
    selected = null,
    busy = false,
    view = "saved",
    opened = false;
  const section = make("section");
  section.id = "office-catalogue";
  section.innerHTML = `<h3>${A.name} catalogue · templates & layouts</h3><p>Built-ins contain editable placeholders or illustrative values. Replace or extend through native preview. Layouts restyle existing content. Save editable copies and keep your own variants.</p><label>Find a starting point<input id="oc-query" type="search" placeholder="Search templates and layouts"></label><div id="oc-templates" class="sw-list"></div><h3>Layout catalogue</h3><div id="oc-layouts" class="sw-list"></div><details id="oc-editor"><summary>Edit or extend a layout</summary><label>Layout name<input id="oc-name" maxlength="120"></label><label>Description<input id="oc-description"></label><div id="oc-fields" class="sw-row"></div><div class="sw-row"><button id="oc-preview">Preview layout on current content</button><button id="oc-save">Save as new layout</button><button id="oc-update" disabled>Update selected saved layout</button><button id="oc-export">Export layout</button><button id="oc-import">Import layout</button><input id="oc-file" type="file" accept=".json,application/json" data-disk-label="Office layout" hidden></div></details><p id="oc-status" role="status"></p>`;
  host.prepend(section);
  const q = (id) => section.querySelector("#" + id),
    status = (text) => (q("oc-status").textContent = text);
  const fields = [
    "accent",
    "textColor",
    "headerFill",
    "headerText",
    "bandFill",
    ...(A.name === "textiX" ? ["fontFamily", "fontSize", "lineHeight"] : []),
  ];
  for (const key of fields) {
    const label = make(
        "label",
        {
          accent: A.name === "sheetiX" ? "Formula accent" : "Heading accent",
          textColor: "Body text",
          headerFill: "Header fill",
          headerText: "Header text",
          bandFill: "Alternating rows",
          fontFamily: "Font family",
          fontSize: "Body size",
          lineHeight: "Line height",
        }[key],
      ),
      input = key === "fontFamily" ? make("select") : make("input");
    input.id = "oc-" + key;
    if (key === "fontFamily")
      for (const font of ["Arial", "Georgia", "Verdana", "Courier New"]) {
        const option = make("option", font);
        option.value = font;
        input.append(option);
      }
    else {
      input.type = ["fontSize", "lineHeight"].includes(key)
        ? "number"
        : "color";
      if (key === "lineHeight") {
        input.step = ".1";
        input.min = "1.1";
        input.max = "2";
      }
      if (key === "fontSize") {
        input.min = "12";
        input.max = "24";
      }
    }
    label.append(input);
    q("oc-fields").append(label);
  }
  const savedPanel = make("section");
  savedPanel.id = "oc-saved-templates";
  for (const node of [...host.childNodes])
    if (node !== section) savedPanel.append(node);
  host.append(savedPanel);
  const layoutPanel = make("section");
  layoutPanel.id = "oc-layout-panel";
  const layoutHeading = q("oc-layouts").previousElementSibling;
  layoutPanel.append(layoutHeading, q("oc-layouts"), q("oc-editor"));
  section.append(layoutPanel);
  const tabs = make("div");
  tabs.className = "oc-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Office catalogue views");
  const panels = {
    templates: q("oc-templates"),
    layouts: layoutPanel,
    saved: savedPanel,
  };
  const viewButtons = {};
  for (const [id, label] of [
    ["templates", "Built-in templates"],
    ["layouts", "Layouts"],
    ["saved", "My templates"],
  ]) {
    const button = make("button", label);
    button.type = "button";
    button.id = "oc-tab-" + id;
    button.dataset.officeView = id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panels[id].id);
    panels[id].setAttribute("role", "tabpanel");
    panels[id].setAttribute("aria-labelledby", button.id);
    button.onclick = () => setView(id);
    viewButtons[id] = button;
    tabs.append(button);
  }
  const count = make("p");
  count.id = "oc-count";
  count.setAttribute("role", "status");
  q("oc-query").closest("label").before(tabs);
  tabs.after(count);
  tabs.onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = Object.keys(panels),
      index = ids.indexOf(view),
      next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? ids.length - 1
            : (index + (event.key === "ArrowLeft" ? -1 : 1) + ids.length) %
              ids.length;
    setView(ids[next]);
    viewButtons[ids[next]].focus();
  };
  function setView(id) {
    view = id;
    for (const key of Object.keys(panels)) {
      panels[key].hidden = key !== id;
      viewButtons[key].setAttribute("aria-selected", String(key === id));
      viewButtons[key].tabIndex = key === id ? 0 : -1;
    }
    q("oc-query").closest("label").hidden = id === "saved";
    updateCount();
    status(
      {
        templates:
          "Choose a template to preview replacing or extending the current content.",
        layouts:
          "Edit a layout, then preview its styling on the current content.",
        saved:
          "Manage your saved variants. Previews require review before application.",
      }[id],
    );
  }
  function updateCount() {
    count.textContent =
      view === "templates"
        ? q("oc-templates").querySelectorAll("[data-office-template]").length +
          " built-in templates"
        : view === "layouts"
          ? q("oc-layouts").querySelectorAll("[data-office-layout]").length +
            " layouts · built-ins and saved variants"
          : "Your editable native templates · save, extend, duplicate or update contents";
  }
  function controls() {
    for (const b of section.querySelectorAll("button")) b.disabled = busy;
    q("oc-update").disabled = busy || !selected;
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    controls();
    try {
      await fn();
    } catch (e) {
      status(e.message);
    } finally {
      busy = false;
      controls();
    }
  }
  function choose(record, editable = false, reveal = true) {
    selected = editable ? record.id : null;
    q("oc-name").value = record.name;
    q("oc-description").value = record.description || "";
    for (const key of fields) q("oc-" + key).value = record.properties[key];
    q("oc-editor").open = true;
    if (reveal) {
      setView("layouts");
      q("oc-editor").scrollIntoView({ block: "nearest" });
    }
    controls();
    status(
      editable
        ? "Editing a saved layout. Preview or save an update."
        : "Built-in layout selected. Edit it and save a new variant.",
    );
  }
  function properties() {
    return C.layout(A.name, {
      format: "suite-office-layout/v1",
      tool: A.name,
      properties: Object.fromEntries(
        fields.map((key) => [
          key,
          ["fontSize", "lineHeight"].includes(key)
            ? Number(q("oc-" + key).value)
            : q("oc-" + key).value,
        ]),
      ),
    });
  }
  function metadata() {
    return {
      name: q("oc-name").value,
      description: q("oc-description").value,
      tags: ["layout", A.name],
    };
  }
  async function refresh() {
    custom = await T.list("layout:" + A.name);
    render();
  }
  function action(label, fn) {
    const b = make("button", label);
    b.type = "button";
    b.onclick = () => run(fn);
    return b;
  }
  function render() {
    const query = q("oc-query").value.trim().toLocaleLowerCase(),
      matches = (r) =>
        [r.name, r.description, ...(r.tags || [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
    q("oc-templates").replaceChildren();
    for (const item of catalog.templates.filter(matches)) {
      const row = make("article");
      row.className = "sw-item";
      row.dataset.officeTemplate = item.id;
      row.append(make("strong", item.name), make("p", item.description));
      const bar = make("div");
      bar.className = "sw-row";
      bar.append(
        action("Preview replace", () =>
          W.review(catalog.create(item.id), "Replace with " + item.name),
        ),
        action("Preview extend", () =>
          W.review(
            C.extend(A.name, A.snapshot(), catalog.create(item.id)),
            "Extend with " + item.name,
          ),
        ),
        action("Save editable copy", async () => {
          const document = catalog.create(item.id);
          await A.validate(SuiteWorkspaceCore.copy(document), A.snapshot());
          await T.put(
            A.name,
            {
              name: item.name + " copy",
              description: item.description,
              tags: item.tags,
            },
            document,
          );
          documentRefresh();
          setView("saved");
          status(
            "Editable template copy saved in My templates. Preview it, edit the native document and update its saved contents.",
          );
        }),
      );
      row.append(bar);
      q("oc-templates").append(row);
    }
    if (!q("oc-templates").children.length) {
      const empty = make(
        "p",
        "No templates match this search. Clear the search or open My templates.",
      );
      empty.dataset.empty = "true";
      q("oc-templates").append(empty);
    }
    q("oc-layouts").replaceChildren();
    for (const item of [
      ...catalog.layouts.map((r) => ({ ...r, builtin: true })),
      ...custom.map((r) => ({ ...r, properties: r.document.properties })),
    ].filter(matches)) {
      const row = make("article");
      row.className = "sw-item";
      row.dataset.officeLayout = item.id;
      row.append(
        make("strong", item.name + (item.builtin ? " · built-in" : " · saved")),
        make("p", item.description),
      );
      row.append(action("Edit layout", () => choose(item, !item.builtin)));
      if (!item.builtin)
        row.append(
          action("Delete saved layout", async () => {
            await T.remove(item.id, "layout:" + A.name);
            if (selected === item.id) selected = null;
            await refresh();
            status("Saved layout removed. Current content is unchanged.");
          }),
        );
      q("oc-layouts").append(row);
    }
    if (!q("oc-layouts").children.length) {
      const empty = make(
        "p",
        "No layouts match this search. Clear the search or import a layout.",
      );
      empty.dataset.empty = "true";
      q("oc-layouts").append(empty);
    }
    updateCount();
  }
  function documentRefresh() {
    document.querySelector("#st-refresh").click();
  }
  q("oc-query").oninput = render;
  q("oc-preview").onclick = () =>
    run(() =>
      W.review(
        C.applyLayout(A.name, A.snapshot(), properties().properties),
        "Apply layout: " + q("oc-name").value,
      ),
    );
  q("oc-save").onclick = () =>
    run(async () => {
      const doc = properties();
      await T.put("layout:" + A.name, metadata(), doc);
      selected = null;
      await refresh();
      status(
        "New layout saved. Current content is unchanged until reviewed application.",
      );
    });
  q("oc-update").onclick = () =>
    run(async () => {
      if (!selected) throw Error("Choose a saved layout.");
      await T.edit(selected, "layout:" + A.name, metadata(), properties());
      await refresh();
      status("Saved layout updated.");
    });
  q("oc-export").onclick = () =>
    run(async () => {
      const packet = { ...properties(), ...T.metadata(metadata()) },
        url = URL.createObjectURL(
          new Blob([JSON.stringify(packet, null, 2)], {
            type: "application/json",
          }),
        ),
        a = make("a");
      a.href = url;
      a.download = A.name + ".layout.json";
      await SuiteDiskUI.download(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
  q("oc-import").onclick = () => q("oc-file").click();
  q("oc-file").onchange = () =>
    run(async () => {
      try {
        const file = q("oc-file").files[0];
        if (!file) return;
        if (file.size > 64000) throw Error("Choose a layout JSON under 64 KB.");
        const raw = JSON.parse(await file.text()),
          doc = C.layout(A.name, raw),
          meta = T.metadata(raw);
        choose({ ...meta, properties: doc.properties });
        status(
          "Layout imported into the editor. Save a new variant or preview it; no document changed.",
        );
      } finally {
        q("oc-file").value = "";
      }
    });
  const open = make("button", "Templates & layouts");
  open.id = "office-catalogue-open";
  open.type = "button";
  open.onclick = () => {
    if (!opened) {
      setView("templates");
      opened = true;
    }
    W.open("templates");
    run(refresh);
  };
  (
    document.querySelector("#suite-tools") || document.querySelector("header")
  ).append(open);
  choose(catalog.layouts[0], false, false);
  q("oc-editor").open = false;
  document
    .querySelector(".sw-tabs [data-panel=templates]")
    ?.addEventListener("click", () => setView("saved"));
  setView("saved");
  run(refresh);
})();
