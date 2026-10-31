(function () {
  "use strict";
  const A = window.SuiteAgentAdapter,
    I = window.ArchitexSemanticImport,
    M = window.SuiteMultimodal;
  if (!A || !I) return;
  const node = (tag, text) => {
      const el = document.createElement(tag);
      if (text !== undefined) el.textContent = text;
      return el;
    },
    $ = (id) => document.getElementById("asi-" + id),
    copy = (v) => JSON.parse(JSON.stringify(v));
  let sources = [],
    excluded = [],
    controller = null,
    review = null,
    result = null,
    revision = 0,
    sourcePage = 0,
    filteredCount = 0,
    renderedIssues = null;
  const SOURCE_PAGE_SIZE = 50;
  const launch = node("button", "✧ AI import");
  launch.id = "semanticImport";
  launch.title =
    "Import semantic architecture from diagrams, graphics, PDFs, source code and archives";
  document.getElementById("import").before(launch);
  const dialog = node("dialog");
  dialog.id = "semanticImportDialog";
  dialog.innerHTML = /* HTML */ `<div class="dialog-top">
      <div>
        <div class="eyebrow">ARCHITECTURE FROM SOURCES</div>
        <h2>AI source importer</h2>
      </div>
      <button
        type="button"
        id="asi-close"
        aria-label="Close AI source importer"
      >
        ×
      </button>
    </div>
    <p>
      Turn sketches, graphics, PDF documents and source code into architecture.
      Review the semantic merge options before analysis; review the model
      changes before applying them.
    </p>
    <details id="asi-source-section" open>
      <summary id="asi-sources-title">1. Sources</summary>
      <details class="asi-help">
        <summary>Supported files and source handling</summary>
        <p>
          Choose individual files, multiple files, a folder, or ZIPs.
          PNG/JPEG/WebP/GIF images and PDFs use native AI inputs; SVG, draw.io,
          Mermaid, XML, source code and text remain readable source content.
          Office packages can provide XML and embedded media. Sources are never
          executed. Use a model that supports the selected image/PDF formats.
          <a
            id="asi-provider-settings"
            target="_blank"
            rel="noopener noreferrer"
            >AI provider settings ↗</a
          >
        </p>
      </details>
      <div class="asi-source-actions">
        <label
          >Files or archives<input
            id="asi-files"
            type="file"
            multiple
            data-disk-label="AI architecture sources" /></label
        ><label
          >Folder<input
            id="asi-folder"
            type="file"
            multiple
            webkitdirectory
            directory
            data-disk-label="AI architecture source folder" /></label
        ><button type="button" id="asi-clear">Clear sources</button>
      </div>
      <p id="asi-source-summary" role="status">No sources selected.</p>
      <div class="asi-source-toolbar">
        <label
          >Find sources<input
            type="search"
            id="asi-search"
            placeholder="Filter file names or paths" /></label
        ><button type="button" id="asi-select-all">Select all sources</button
        ><button type="button" id="asi-deselect-all">
          Deselect all sources
        </button>
      </div>
      <div id="asi-sources"></div>
      <nav class="asi-source-pages" aria-label="Source pages">
        <button type="button" id="asi-previous">Previous</button
        ><span id="asi-page-label" role="status"></span
        ><button type="button" id="asi-next">Next</button>
      </nav>
      <details id="asi-excluded" hidden>
        <summary>Files that could not be loaded</summary>
        <ul id="asi-excluded-list"></ul>
      </details>
    </details>
    <details id="asi-options" open>
      <summary id="asi-options-title">2. Merge options</summary>
      <div class="asi-fields">
        <label
          >Import into<select id="asi-target">
            <option value="both">
              Both models · definitions and instances
            </option>
            <option value="metamodel">Metamodel / direct diagram only</option>
            <option value="instances">
              Instance model only · existing types
            </option>
          </select></label
        ><label
          >Across files and diagram views<select id="asi-sourceMerge">
            <option value="semantic">
              Unify semantically matching concepts
            </option>
            <option value="exact">
              Unify exact names / qualified IDs only
            </option>
            <option value="separate">Keep each source / view separate</option>
          </select></label
        ><label
          >How should semantic content be merged?<select id="asi-strategy">
            <option value="merge">
              Merge semantically matching entities · keep stable IDs
            </option>
            <option value="add">
              Add as distinct entities · preserve existing content
            </option>
            <option value="replace">Replace the selected model scope</option>
          </select></label
        >
      </div>
      <details id="asi-advanced">
        <summary>Conflict, grouping and relationship options</summary>
        <div class="asi-fields">
          <label
            >Conflicting attributes<select id="asi-conflicts">
              <option value="existing">
                Keep existing values · fill missing attributes
              </option>
              <option value="incoming">
                Prefer incoming values on matched entities
              </option>
            </select></label
          ><label
            >Grouping<select id="asi-grouping">
              <option value="source">
                Preserve explicit source / diagram groups
              </option>
              <option value="semantic">
                Group by architectural responsibility
              </option>
              <option value="flat">Keep newly imported entities flat</option>
            </select></label
          ><label
            >Relationships<select id="asi-relations">
              <option value="explicit">
                Only explicitly supported relationships
              </option>
              <option value="infer">Allow explained inferences</option>
            </select></label
          >
        </div>
      </details>
      <p id="asi-direct" hidden>
        Direct diagram mode is active: import edits diagram components and
        dependencies, keeping typed instances empty.
      </p>
      <p id="asi-replace-note" hidden>
        Replacement may remove existing entities in the selected scope. Other
        model sections and validation rules are preserved. Cross-model
        references must remain valid.
      </p>
      <label
        >Import guidance or answers to AI questions<textarea
          id="asi-instructions"
          rows="3"
          placeholder="For example: merge the same service across diagrams; keep staging and production as separate instances."
        ></textarea>
      </label>
      <p id="asi-option-summary" class="asi-muted"></p>
      <label class="asi-confirm"
        ><input id="asi-confirm" type="checkbox" />I have reviewed the selected
        sources and these merge options. Analyze them using the configured AI
        chat provider.</label
      >
      <p>
        Analysis sends the selected content, current model and schemas to the
        same relay/provider as AI chat. Loading files alone sends nothing.
        Validation rules are preserved and cannot be imported or activated here.
      </p>
    </details>
    <div class="asi-actions">
      <button type="button" id="asi-analyze" class="primary" disabled>
        Analyze sources &amp; propose import</button
      ><button type="button" id="asi-stop" hidden>Stop</button>
    </div>
    <div id="asi-paging-progress"></div>
    <p id="asi-status" role="status" aria-live="polite">
      Choose sources and confirm the merge options.
    </p>
    <section id="asi-review" hidden aria-labelledby="asi-review-title">
      <h3 id="asi-review-title">3. Review before importing</h3>
      <p id="asi-answer"></p>
      <div id="asi-feedback"></div>
      <div id="asi-questions"></div>
      <div id="asi-diff"></div>
      <details id="asi-proposal-detail">
        <summary>Complete proposed model</summary>
        <pre id="asi-proposal"></pre>
      </details>
      <div class="asi-actions">
        <button type="button" class="primary" id="asi-apply" disabled>
          Apply reviewed import</button
        ><button type="button" id="asi-report">Download import report</button>
      </div>
    </section>
    <details id="asi-output-detail">
      <summary>Background AI response</summary>
      <pre id="asi-output">No analysis yet.</pre>
    </details>`;
  document.body.append(dialog);
  function message(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("asi-error", error);
  }
  function settings() {
    return I.options(
      Object.fromEntries(
        [
          "target",
          "sourceMerge",
          "strategy",
          "conflicts",
          "grouping",
          "relations",
          "instructions",
        ].map((k) => [k, $(k).value]),
      ),
    );
  }
  function resetReview() {
    review = null;
    result = null;
    $("review").hidden = true;
    $("apply").disabled = true;
    for (const id of ["answer", "feedback", "questions", "diff"])
      $(id).replaceChildren();
    lazyText($("proposal-detail"), $("proposal"), () => "No current proposal.");
    lazyText($("output-detail"), $("output"), () => "No analysis yet.");
  }
  function invalidate(
    text = "Sources or options changed. Confirm the merge options and analyze again.",
  ) {
    revision++;
    resetReview();
    $("paging-progress").replaceChildren();
    $("confirm").checked = false;
    if (!controller) message(text);
    controls();
  }
  function controls() {
    const busy = !!controller;
    for (const id of [
      "files",
      "folder",
      "clear",
      "analyze",
      "target",
      "sourceMerge",
      "strategy",
      "conflicts",
      "grouping",
      "relations",
      "instructions",
      "confirm",
      "select-all",
      "deselect-all",
    ])
      $(id).disabled = busy;
    for (const input of $("sources").querySelectorAll("input,select,button"))
      input.disabled = busy;
    $("analyze").disabled =
      busy || !$("confirm").checked || !sources.some((f) => f.included);
    $("conflicts").disabled = busy || $("strategy").value !== "merge";
    $("stop").hidden = !busy;
    $("apply").disabled = busy || !review || !review.hasChanges;
    $("replace-note").hidden = $("strategy").value !== "replace";
    $("previous").hidden = $("next").hidden = filteredCount <= SOURCE_PAGE_SIZE;
    $("previous").disabled = sourcePage === 0;
    $("next").disabled = (sourcePage + 1) * SOURCE_PAGE_SIZE >= filteredCount;
    const policy =
      $("strategy").value === "merge"
        ? $("conflicts").selectedOptions[0].textContent
        : $("strategy").value === "add"
          ? "Existing content stays unchanged"
          : "Selected scope will be replaced";
    $("option-summary").textContent = [
      policy,
      $("grouping").selectedOptions[0].textContent,
      $("relations").selectedOptions[0].textContent,
    ].join(" · ");
  }
  function lazyText(details, pre, produce) {
    let rendered = false;
    pre.textContent = "";
    details.open = false;
    details.ontoggle = () => {
      if (details.open && !rendered) {
        pre.textContent = produce();
        rendered = true;
      }
    };
  }
  function sourceRow(file) {
    const row = node("div");
    row.className = "asi-source";
    const label = node("label"),
      checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.checked = file.included;
    checkbox.setAttribute("aria-label", "Include " + file.name);
    checkbox.onchange = () => {
      file.included = checkbox.checked;
      invalidate();
      renderSummary();
    };
    label.append(checkbox, document.createTextNode(file.name));
    const remove = node("button", "Remove");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove source " + file.name);
    remove.onclick = () => {
      sources = sources.filter((item) => item !== file);
      invalidate();
      renderSources();
    };
    const header = node("div");
    header.className = "asi-source-heading";
    header.append(label, remove);
    row.append(header);
    row.append(
      node(
        "small",
        (file.kind === "text"
          ? "Text · " + file.content.length + " characters"
          : file.kind) +
          " · " +
          file.bytes +
          " bytes",
      ),
    );
    const details = node("details");
    details.className = "asi-source-details";
    details.append(node("summary", "Preview & reference options"));
    let mounted = false;
    details.ontoggle = () => {
      if (!details.open || mounted) return;
      mounted = true;
      details.append(
        node(
          "small",
          "SHA-256 " +
            file.sha256 +
            (file.preprocessing ? " · " + file.preprocessing : ""),
        ),
      );
      if (file.kind === "image") {
        const image = node("img");
        image.loading = "lazy";
        image.src = file.dataUrl;
        image.alt = file.name;
        details.append(image);
      }
      M.referenceControls(details, file);
      if (file.kind === "text") details.append(node("pre", file.content));
      controls();
    };
    row.append(details);
    return row;
  }
  function renderSources() {
    const query = $("search").value.trim().toLowerCase(),
      filtered = query
        ? sources.filter((file) => file.name.toLowerCase().includes(query))
        : sources;
    filteredCount = filtered.length;
    sourcePage = Math.min(
      sourcePage,
      Math.max(0, Math.ceil(filteredCount / SOURCE_PAGE_SIZE) - 1),
    );
    const start = sourcePage * SOURCE_PAGE_SIZE;
    $("sources").replaceChildren(
      ...filtered.slice(start, start + SOURCE_PAGE_SIZE).map(sourceRow),
    );
    $("page-label").textContent = filteredCount
      ? "Showing " +
        (start + 1) +
        "–" +
        Math.min(start + SOURCE_PAGE_SIZE, filteredCount) +
        " of " +
        filteredCount +
        (query ? " matching sources" : " sources")
      : "No matching sources";
    $("excluded").hidden = !excluded.length;
    if (renderedIssues !== excluded) {
      $("excluded-list").replaceChildren();
      renderedIssues = null;
    }
    if ($("excluded").open) renderExcluded();
    renderSummary();
    controls();
  }
  function renderExcluded() {
    if (renderedIssues === excluded) return;
    renderedIssues = excluded;
    $("excluded-list").replaceChildren(
      ...excluded.map((file) => node("li", file.name + ": " + file.message)),
    );
  }
  function renderSummary() {
    const included = sources.filter((f) => f.included);
    $("source-summary").textContent =
      included.length +
      " of " +
      sources.length +
      " readable sources selected · " +
      excluded.length +
      " unreadable/unsupported entries. Archive paths are retained.";
  }
  async function load(files) {
    if (controller || !files.length) return;
    const pending = new AbortController();
    controller = pending;
    controls();
    try {
      const loaded = await I.readSources(files, {
        existing: sources,
        signal: pending.signal,
        onProgress: (text) => message(text),
      });
      sources.push(...loaded.items.map((f) => ({ ...f, included: true })));
      excluded = excluded.concat(loaded.issues);
      invalidate(
        "Sources loaded locally. Choose and confirm semantic merge options before analysis.",
      );
      message(
        "Sources loaded locally. Choose and confirm semantic merge options before analysis.",
      );
    } catch (error) {
      message(error.message, error.name !== "AbortError");
    } finally {
      controller = null;
      renderSources();
    }
  }
  function sourceManifest(files) {
    return files.map((f) => ({
      name: f.name,
      sourcePath: f.sourcePath,
      kind: f.kind,
      mimeType: f.mimeType || null,
      bytes: f.bytes,
      sha256: f.sha256,
      ...(f.preprocessing ? { preprocessing: f.preprocessing } : {}),
    }));
  }
  function renderResponse(value) {
    $("review").hidden = false;
    $("answer").textContent = value.response.answer;
    $("feedback").replaceChildren();
    for (const item of [
      ...(Array.isArray(value.response.assumptions)
        ? value.response.assumptions
        : []),
      ...(Array.isArray(value.response.comments)
        ? value.response.comments
        : []),
    ]) {
      const text = typeof item === "string" ? item : item?.text;
      if (text) $("feedback").append(node("p", text));
    }
    $("questions").replaceChildren();
    for (const q of Array.isArray(value.response.questions)
      ? value.response.questions
      : []) {
      if (typeof q?.text !== "string") continue;
      const box = node("section");
      box.className = "asi-question";
      box.append(node("strong", q.text));
      for (const option of Array.isArray(q.options) ? q.options : []) {
        const label = typeof option === "string" ? option : option?.label;
        if (typeof label !== "string") continue;
        const button = node("button", label);
        button.type = "button";
        button.onclick = () => {
          $("instructions").value +=
            ($("instructions").value ? "\n" : "") +
            "Question: " +
            q.text +
            "\nAnswer: " +
            label;
          invalidate(
            "Answer added to import guidance. Review the options and confirm before analyzing again.",
          );
        };
        box.append(button);
      }
      box.append(
        node(
          "small",
          "Answer using an option or the import guidance field, then confirm and analyze again.",
        ),
      );
      $("questions").append(box);
    }
    $("diff").replaceChildren();
    lazyText($("proposal-detail"), $("proposal"), () =>
      value.candidate
        ? JSON.stringify(value.candidate, null, 2)
        : "No model proposal; answer the questions or adjust the import guidance.",
    );
    if (value.candidate) {
      const table = node("table"),
        thead = node("thead"),
        tr = node("tr");
      for (const name of ["Collection", "Added", "Updated", "Removed"])
        tr.append(node("th", name));
      thead.append(tr);
      table.append(thead);
      const tbody = node("tbody");
      for (const entry of value.changes) {
        const row = node("tr");
        for (const text of [
          entry.key,
          entry.added.length,
          entry.changed.length,
          entry.removed.length,
        ])
          row.append(node("td", String(text)));
        tbody.append(row);
        if (entry.changed.length) {
          const details = node("details");
          details.append(
            node(
              "summary",
              "Inspect " + entry.changed.length + " updated " + entry.key,
            ),
          );
          const pre = node("pre");
          details.append(pre);
          lazyText(details, pre, () => JSON.stringify(entry.changed, null, 2));
          $("diff").append(details);
        }
      }
      table.append(tbody);
      $("diff").prepend(table);
      if (value.before.metamodel.name !== value.candidate.metamodel.name)
        $("diff").append(
          node(
            "p",
            "Workspace name: " +
              value.before.metamodel.name +
              " → " +
              value.candidate.metamodel.name,
          ),
        );
    }
  }
  function style() {
    return A.selection?.()?.modelingStyle || "typed";
  }
  launch.onclick = () => {
    if (!dialog.open) {
      $("provider-settings").href = SuiteChatBackground.relay() + "/relay";
      const direct = style() === "diagram";
      $("target").querySelector('[value="both"]').disabled = direct;
      $("target").querySelector('[value="instances"]').disabled = direct;
      $("direct").hidden = !direct;
      if (direct && $("target").value !== "metamodel") {
        $("target").value = "metamodel";
        invalidate();
      }
      dialog.showModal();
      controls();
    }
  };
  $("close").onclick = () => {
    controller?.abort();
    dialog.close();
  };
  dialog.addEventListener("cancel", () => controller?.abort());
  $("stop").onclick = () => controller?.abort();
  for (const id of ["files", "folder"])
    $(id).onchange = async (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      await load(files);
    };
  $("clear").onclick = () => {
    sources = [];
    excluded = [];
    sourcePage = 0;
    $("search").value = "";
    invalidate("Sources cleared. The architecture model is unchanged.");
    renderSources();
  };
  $("sources").addEventListener("input", (e) => {
    if (e.target.type !== "checkbox") invalidate();
  });
  $("sources").addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT") invalidate();
  });
  $("options").addEventListener("input", (e) => {
    if (e.target.id === "asi-confirm") {
      controls();
      return;
    }
    invalidate();
  });
  $("options").addEventListener("change", (e) => {
    if (e.target.id === "asi-confirm") {
      controls();
      return;
    }
    if (e.target.tagName === "SELECT") invalidate();
  });
  async function analyze() {
    if (controller || !$("confirm").checked) return;
    const files = sources
      .filter((f) => f.included)
      .map((file) => ({ ...file }));
    if (!files.length) return;
    const before = A.snapshot(),
      baseline = JSON.stringify(before),
      mode = style(),
      o = settings(),
      version = revision,
      pending = new AbortController();
    controller = pending;
    resetReview();
    $("paging-progress").replaceChildren();
    controls();
    const assertCurrent = () => {
      if (pending.signal.aborted)
        throw new DOMException("Import stopped.", "AbortError");
      if (
        version !== revision ||
        style() !== mode ||
        JSON.stringify(A.snapshot()) !== baseline
      )
        throw Error(
          "The workspace or import choices changed. No import was applied; analyze again against the current model.",
        );
    };
    try {
      const value = await SuiteChatBackground.propose({
        task: I.task(o),
        document: before,
        attachments: files.map(({ included, ...f }) => f),
        metadata: {
          kind: "architex-semantic-import/v1",
          confirmedOptions: o,
          sources: sourceManifest(files),
          excluded: copy(excluded),
        },
        signal: pending.signal,
        panelTarget: $("paging-progress"),
        onStatus: (text) => message(text),
        assertCurrent,
        validate: (candidate) => I.validatePolicy(before, candidate, o),
      });
      assertCurrent();
      result = {
        ...value,
        options: o,
        version,
        sources: sourceManifest(files),
        excluded: copy(excluded),
        modelingStyle: mode,
        createdAt: new Date().toISOString(),
        hasChanges: !!value.candidate && !I.equal(before, value.candidate),
        changes: value.candidate ? I.diff(before, value.candidate) : [],
      };
      if (value.candidate) review = result;
      lazyText($("output-detail"), $("output"), () =>
        JSON.stringify(value.response, null, 2),
      );
      renderResponse(result);
      message(
        value.candidate
          ? !result.hasChanges
            ? "No model changes proposed. Review the interpretation or adjust the guidance."
            : "Proposal ready. Review the semantic matches and model changes, then apply explicitly."
          : "The AI needs clarification. Answer the questions or refine the import guidance.",
      );
    } catch (error) {
      message(
        error.name === "AbortError"
          ? "Import analysis stopped. No model changes were applied."
          : error.message,
        error.name !== "AbortError",
      );
      lazyText($("output-detail"), $("output"), () => error.message);
    } finally {
      controller = null;
      controls();
    }
  }
  async function applyReview() {
    if (controller || !review) return;
    const chosen = review,
      pending = new AbortController();
    controller = pending;
    controls();
    const assertCurrent = () => {
      if (pending.signal.aborted)
        throw new DOMException("Import stopped.", "AbortError");
      if (
        chosen !== review ||
        chosen.version !== revision ||
        chosen.modelingStyle !== style() ||
        JSON.stringify(A.snapshot()) !== chosen.baseline
      )
        throw Error(
          "The workspace or import options changed. Analyze again before applying.",
        );
    };
    try {
      assertCurrent();
      I.validatePolicy(chosen.before, chosen.candidate, chosen.options);
      const candidate = await A.validate(copy(chosen.candidate), chosen.before);
      await A.beforeApply?.(candidate);
      assertCurrent();
      A.apply(candidate);
      if (result) result.appliedAt = new Date().toISOString();
      review = null;
      message(
        "Reviewed architecture import applied. Use Undo (Ctrl/Command+Z) to restore the previous model.",
      );
      $("apply").disabled = true;
    } catch (error) {
      message(
        error.name === "AbortError"
          ? "Import stopped. No changes were applied."
          : error.message,
        error.name !== "AbortError",
      );
    } finally {
      controller = null;
      controls();
    }
  }
  function exportReport() {
    if (!result) return;
    const packet = {
        format: "architex-semantic-import-report",
        version: 1,
        createdAt: result.createdAt,
        applied: !!result.appliedAt,
        appliedAt: result.appliedAt || null,
        options: result.options,
        sources: result.sources,
        excluded: result.excluded,
        interpretation: result.response,
        proposal: result.candidate,
        changes: result.changes,
        note: "AI interpretation and proposed model changes, not proof of source correctness. Original source bytes and provider credentials are not included.",
      },
      link = node("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(packet, null, 2)], {
          type: "application/json",
        }),
      );
    link.href = url;
    link.download = "architex-semantic-import-report.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  $("analyze").onclick = analyze;
  $("apply").onclick = applyReview;
  $("report").onclick = exportReport;
  $("search").oninput = () => {
    sourcePage = 0;
    renderSources();
  };
  $("previous").onclick = () => {
    sourcePage = Math.max(0, sourcePage - 1);
    renderSources();
  };
  $("next").onclick = () => {
    sourcePage++;
    renderSources();
  };
  for (const [id, included] of [
    ["select-all", true],
    ["deselect-all", false],
  ])
    $(id).onclick = () => {
      for (const file of sources) file.included = included;
      invalidate();
      renderSources();
    };
  $("excluded").ontoggle = () => {
    if ($("excluded").open) renderExcluded();
  };
  renderSources();
  window.ArchitexSourceImporter = { open: () => launch.click() };
})();
