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
  style.href = new URL("shared-suite/hub.css?v=20261027", base).href;
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
    '<header><div><small>TLAL OS · WORKSPACE SUITE</small><h2 id="hub-title">Apps & display</h2></div><button type="button" id="hub-close" aria-label="Close apps and display">×</button></header><p>Switch tools, pin favorites and choose a comfortable interface. Alt + Shift + P opens this window. Use Down from search to browse apps; Tab reaches pin controls.</p><label for="hub-search">Find an app</label><input id="hub-search" type="search" placeholder="Search apps, categories or capabilities…"><p id="hub-count" role="status"></p><div id="hub-apps"></div><details><summary>Display preferences & keyboard help</summary><label>Interface density<select id="hub-density"><option value="comfortable">Comfortable</option><option value="compact">Compact controls</option></select></label><label><input id="hub-motion" type="checkbox"> Reduce interface motion</label><p>Preferences affect editor controls, not artwork, document text or video playback.</p><ul><li>Alt + Shift + P: app switcher</li><li>Ctrl / ⌘ + K: workspace commands, when available</li><li>Esc: close the active dialog</li></ul><button type="button" id="hub-reset">Reset display preferences</button></details><footer><button type="button" id="hub-workspace">Workspace commands</button><a id="hub-desktop">Open desktop</a></footer><p id="hub-status" role="status" aria-live="polite"></p>';
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
      icon.src = new URL("assets/icons/" + app.id + ".svg?v=tlal-mockix-20261031", base).href;
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
  function render() {
    const found = C.appSearch(apps, q("#hub-search").value, prefs).filter(
      (app) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(app.id),
    );
    q("#hub-count").textContent =
      found.length +
      " of " +
      apps.length +
      " apps" +
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
  q("#hub-search").onkeydown = (event) => {
    if (event.key !== "ArrowDown") return;
    const first = q("#hub-apps").querySelector("a");
    if (first) {
      event.preventDefault();
      first.focus();
    }
  };
  q("#hub-apps").onkeydown = (event) => {
    if (
      !event.target.matches("a") ||
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    )
      return;
    const links = [...q("#hub-apps").querySelectorAll("a")],
      index = links.indexOf(event.target);
    event.preventDefault();
    if (event.key === "ArrowUp" && index === 0) {
      q("#hub-search").focus();
      return;
    }
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? links.length - 1
          : Math.min(
              links.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1),
            );
    links[next]?.focus();
  };

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
  button.setAttribute("aria-label", "Apps and display preferences");
  button.title = "Switch apps and display preferences (Alt+Shift+P)";
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
