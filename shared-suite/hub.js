(function () {
  "use strict";
  const base = new URL("../", document.currentScript.src),
    C = SuiteHubCore,
    apps = window.SuiteApps || [],
    current = apps.find((a) =>
      location.pathname.startsWith(new URL(a.id + "/", base).pathname),
    ),
    KEY = "suite-navigation-preferences-v1";
  let prefs = C.preferences(),
    storageError = false;
  try {
    prefs = C.preferences(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    storageError = true;
  }
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = new URL(
    "shared-suite/hub.css?v=quick-actions-20261108",
    base,
  ).href;
  document.head.append(style);
  function apply() {
    const resized =
      document.documentElement.dataset.suiteDensity !== prefs.density;
    document.documentElement.dataset.suiteDensity = prefs.density;
    document.documentElement.dataset.suiteMotion = prefs.reduceMotion
      ? "reduce"
      : "system";
    if (resized) window.dispatchEvent(new Event("resize"));
  }
  function save() {
    apply();
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
      storageError = false;
    } catch {
      storageError = true;
    }
    message(
      storageError
        ? "Settings apply in this tab; browser storage is unavailable."
        : "Preferences saved.",
    );
  }
  if (current) {
    prefs.recent = [
      current.id,
      ...prefs.recent.filter((id) => id !== current.id),
    ].slice(0, 12);
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      storageError = true;
    }
  }
  apply();
  const dialog = document.createElement("dialog");
  dialog.id = "suite-hub";
  dialog.setAttribute("aria-labelledby", "hub-title");
  dialog.innerHTML =
    '<header><div><small>TLAL OS · WORKSPACE SUITE</small><h2 id="hub-title">Apps & actions</h2></div><button type="button" id="hub-close" aria-label="Close apps and actions">×</button></header><p>Search apps and workspace actions. Use Down/Up to browse, Enter to open and Tab for pin controls. Alt + Shift + P opens this window.</p><label for="hub-search">Find an app or action</label><input id="hub-search" type="search" placeholder="Search apps, templates, review, tasks…"><p id="hub-count" role="status"></p><section id="hub-action-section" aria-labelledby="hub-actions-title" hidden><h3 id="hub-actions-title">Current workspace actions</h3><div id="hub-actions"></div></section><h3>Apps</h3><div id="hub-apps"></div><details><summary>Display preferences & keyboard help</summary><label>Interface density<select id="hub-density"><option value="comfortable">Comfortable</option><option value="compact">Compact controls</option></select></label><label><input id="hub-motion" type="checkbox"> Reduce interface motion</label><p>Preferences affect editor controls, not artwork, document text or video playback.</p><ul><li>Alt + Shift + P: app switcher</li><li>Ctrl / ⌘ + K: workspace commands, when available</li><li>Esc: close the active dialog</li></ul><button type="button" id="hub-reset">Reset display preferences</button></details><footer><button type="button" id="hub-workspace">Workspace commands</button><a id="hub-desktop">Open desktop</a></footer><p id="hub-status" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const q = (s) => dialog.querySelector(s);
  q("#hub-desktop").href = base.href;
  function message(text) {
    q("#hub-status").textContent = text;
  }
  const appRows = new Map();
  function appRow(app) {
    let view = appRows.get(app.id);
    if (!view) {
      const row = document.createElement("div");
      row.className = "hub-app";
      const link = document.createElement("a");
      link.href = new URL(app.id + "/", base).href;
      if (app.id === current?.id) link.setAttribute("aria-current", "page");
      const icon = document.createElement("img");
      icon.src = new URL(
        "assets/icons/" + app.id + ".svg?v=tlal-mockix-20261031",
        base,
      ).href;
      icon.alt = "";
      icon.decoding = "async";
      const text = document.createElement("span"),
        name = document.createElement("strong"),
        description = document.createElement("small");
      text.append(name, description);
      link.append(icon, text);
      link.onclick = (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return;
        if (
          window.SuiteWorkspaceAdapter?.isBusy?.() ||
          window.SuiteCodingAgent?.running?.() ||
          (current?.id === "shelliX" &&
            document.querySelector("#stop:not(:disabled)"))
        ) {
          event.preventDefault();
          message("Stop active operations before switching apps.");
        }
      };
      const pin = document.createElement("button");
      pin.type = "button";
      pin.onclick = () => {
        const favorite = prefs.favorites.includes(app.id);
        prefs.favorites = favorite
          ? prefs.favorites.filter((id) => id !== app.id)
          : [...prefs.favorites, app.id];
        save();
        render();
        pin.focus({ preventScroll: true });
      };
      row.append(link, pin);
      view = { row, name, description, pin };
      appRows.set(app.id, view);
    }
    view.name.textContent = app.name;
    view.description.textContent = app.category + " · " + app.description;
    view.pin.textContent = app.favorite ? "★" : "☆";
    view.pin.setAttribute(
      "aria-label",
      (app.favorite ? "Unpin " : "Pin ") + app.name,
    );
    view.pin.setAttribute("aria-pressed", String(app.favorite));
    return view.row;
  }
  const actionRows = new Map();
  function actionTarget(id) {
    const target = document.getElementById(id);
    return target && !target.hidden && !target.closest("[hidden]")
      ? target
      : null;
  }
  function actionRow(action) {
    let view = actionRows.get(action.id);
    if (!view) {
      const launch = document.createElement("button");
      launch.type = "button";
      launch.dataset.hubAction = action.id;
      const label = document.createElement("strong"),
        description = document.createElement("small");
      launch.append(label, description);
      launch.onclick = () => {
        // Recheck live availability; rendering the search must not bypass disabled controls.
        const target = actionTarget(action.target);
        if (!target || target.disabled) {
          message(
            "This action is unavailable. Wait for the app to finish loading or its active operation to complete.",
          );
          render();
          q("#hub-search").focus();
          return;
        }
        dialog.close();
        target.click();
      };
      view = { launch, label, description };
      actionRows.set(action.id, view);
    }
    view.label.textContent = action.label;
    view.description.textContent = action.description;
    view.launch.disabled = !!actionTarget(action.target)?.disabled;
    return view.launch;
  }
  function renderActions() {
    const available = C.actionTargets().filter((id) => actionTarget(id)),
      actions = C.actionSearch(available, q("#hub-search").value),
      rows = actions.map(actionRow),
      keep = new Set(rows),
      target = q("#hub-actions");
    for (const child of [...target.children])
      if (!keep.has(child)) child.remove();
    rows.forEach((row, index) => {
      if (target.children[index] !== row)
        target.insertBefore(row, target.children[index] || null);
    });
    q("#hub-action-section").hidden = !rows.length;
    return actions.length;
  }
  function render() {
    const actionCount = renderActions();
    const found = C.appSearch(apps, q("#hub-search").value, prefs).filter(
      (app) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(app.id),
    );
    q("#hub-count").textContent =
      found.length +
      " of " +
      apps.length +
      " apps · " +
      actionCount +
      (actionCount === 1 ? " workspace action" : " workspace actions") +
      (current ? " · current: " + current.name : "");
    const target = q("#hub-apps"),
      rows = found.map(appRow),
      keep = new Set(rows);
    for (const child of [...target.childNodes])
      if (!keep.has(child)) child.remove();
    rows.forEach((row, index) => {
      if (target.children[index] !== row)
        target.insertBefore(row, target.children[index] || null);
    });
    if (!rows.length)
      target.textContent =
        "No apps match. Try a tool name or another capability.";
    q("#hub-density").value = prefs.density;
    q("#hub-motion").checked = prefs.reduceMotion;
    q("#hub-workspace").hidden = !window.SuiteWorkspace;
    q("#hub-workspace").disabled = false;
  }
  const resultControls = () => [
    ...dialog.querySelectorAll(
      "#hub-actions button:not(:disabled), #hub-apps a",
    ),
  ];
  q("#hub-search").onkeydown = (event) => {
    if (
      event.isComposing ||
      !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    )
      return;
    const results = resultControls();
    if (!results.length) return;
    event.preventDefault();
    if (event.key === "Enter") results[0].click();
    else (event.key === "ArrowUp" ? results.at(-1) : results[0]).focus();
  };
  dialog.addEventListener("keydown", (event) => {
    if (
      event.isComposing ||
      !event.target.matches("#hub-actions button, #hub-apps a") ||
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    )
      return;
    const results = resultControls(),
      index = results.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && index === 0) {
      q("#hub-search").focus();
      return;
    }
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? results.length - 1
          : Math.min(
              results.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1),
            );
    results[next]?.focus();
  });

  function open() {
    render();
    message(
      storageError
        ? "Settings apply in this tab; browser storage is unavailable."
        : "",
    );
    if (!dialog.open) dialog.showModal();
    q("#hub-search").focus();
  }
  q("#hub-close").onclick = () => dialog.close();
  q("#hub-search").oninput = render;
  q("#hub-density").onchange = () => {
    prefs.density = q("#hub-density").value;
    save();
  };
  q("#hub-motion").onchange = () => {
    prefs.reduceMotion = q("#hub-motion").checked;
    save();
  };
  q("#hub-reset").onclick = () => {
    prefs.density = "comfortable";
    prefs.reduceMotion = false;
    save();
    render();
  };
  q("#hub-workspace").onclick = () => {
    dialog.close();
    window.SuiteWorkspace?.open();
  };
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  const button = document.createElement("button");
  button.type = "button";
  button.id = "suite-hub-open";
  button.textContent = "Apps";
  button.setAttribute(
    "aria-label",
    "Apps, workspace actions and display preferences",
  );
  button.title = "Find apps, actions and display preferences (Alt+Shift+P)";
  (
    document.querySelector(".desktop-header-links") ||
    document.querySelector("body > header") ||
    document.querySelector("#suite-tools")
  ).append(button);
  button.onclick = open;
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "p"
      ) {
        if (
          [...document.querySelectorAll("dialog[open]")].some(
            (d) => d !== dialog,
          )
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
      }
    },
    true,
  );
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    try {
      prefs = C.preferences(JSON.parse(event.newValue || "{}"));
      apply();
      if (dialog.open) render();
    } catch {
      message(
        "Saved display settings are invalid; current settings were kept.",
      );
    }
  });
  window.SuiteHub = { open, preferences: () => C.preferences(prefs) };
})();
