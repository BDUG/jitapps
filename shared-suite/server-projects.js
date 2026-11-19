/* Server-backed editor projects. Browser recovery is retained as an independent fallback. */
(function (root) {
  "use strict";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  async function request(app, data) {
    const response = await fetch("/api/projects", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Architex-Request": "1",
      },
      body: JSON.stringify({ app, ...data }),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw Error("Project server unavailable. Start the Python suite server.");
    }
    if (!response.ok)
      throw Object.assign(Error(result.error || "Project request failed"), {
        conflict: response.status === 409,
      });
    return result;
  }
  function fileRecord(file) {
    return file.arrayBuffer().then((buffer) => {
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let offset = 0; offset < bytes.length; offset += 32768)
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 32768),
        );
      return {
        path: file.webkitRelativePath || file.name,
        encoding: "base64",
        content: btoa(binary),
      };
    });
  }
  function mount(app, adapter) {
    const panel = document.createElement("details");
    panel.className = "server-projects";
    panel.innerHTML =
      '<summary>Server projects &amp; files</summary><div class="sp-actions"><select aria-label="Saved server projects"></select><button data-action="refresh">Refresh</button><button data-action="open">Open project</button><button data-action="save">Save now</button><button data-action="copy">Save as new project</button></div><p class="sp-status" role="status"></p><p class="sp-root"></p><div class="sp-actions"><input aria-label="Project folder path" placeholder="Folder path, e.g. docs/examples"><button data-action="folder">New folder</button></div><div class="sp-tree" aria-label="Server project files"></div>';
    (document.querySelector("header") || document.body.firstChild).after(panel);
    const status = panel.querySelector(".sp-status"),
      select = panel.querySelector("select"),
      tree = panel.querySelector(".sp-tree"),
      folderInput = panel.querySelector("input");
    let selected = null,
      folders = [],
      timer,
      working = false,
      revision = 0,
      savedRevision = 0,
      suspended = false,
      blocked = false,
      opening = false,
      inFlight = null,
      lastObserved;
    const marker = "suite-server-project/" + app;
    const report = (text) => {
      status.textContent = text;
    };
    const pending = () => revision !== savedRevision;
    function changed() {
      if (suspended) return;
      const observed = signature();
      if (observed === lastObserved) return;
      lastObserved = observed;
      revision++;
      try {
        localStorage.setItem(marker + "/pending", "1");
      } catch {}
      clearTimeout(timer);
      if (!blocked && !opening)
        timer = setTimeout(
          () => save().catch((error) => report(error.message)),
          500,
        );
    }
    async function refresh() {
      const result = await request(app, { action: "list" });
      select.replaceChildren(
        new Option("Select a saved project…", ""),
        ...result.projects.map(
          (project) =>
            new Option(
              project.name +
                " · " +
                project.id.slice(-6) +
                " · revision " +
                project.revision,
              project.id,
            ),
        ),
      );
      if (selected) select.value = selected.id;
    }
    function signature() {
      const value = adapter.snapshot();
      return JSON.stringify({
        state: value.state,
        folders: [...new Set([...folders, ...(value.folders || [])])],
      });
    }
    function snapshot() {
      const value = adapter.snapshot();
      return {
        ...value,
        folders: [...new Set([...folders, ...(value.folders || [])])],
      };
    }
    function renderTree() {
      tree.replaceChildren();
      const value = snapshot(),
        paths = value.files.map((file) => file.path),
        directories = new Set(value.folders || []);
      for (const path of paths) {
        let parts = path.split("/");
        while (parts.length > 1) {
          parts.pop();
          directories.add(parts.join("/"));
        }
      }
      for (const [path, isFolder] of [
        ...[...directories].sort().map((path) => [path, true]),
        ...paths.sort().map((path) => [path, false]),
      ]) {
        const row = document.createElement("div"),
          label = document.createElement("span");
        label.textContent = (isFolder ? "▸ " : "") + path;
        row.append(label);
        if (!isFolder) {
          const download = document.createElement("button");
          download.textContent = "Download";
          download.setAttribute("aria-label", "Download " + path);
          download.onclick = () => {
            const file = value.files.find((f) => f.path === path),
              bytes =
                file.encoding === "base64"
                  ? Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))
                  : file.content,
              url = URL.createObjectURL(new Blob([bytes])),
              link = document.createElement("a");
            link.href = url;
            link.download = path.split("/").pop();
            if (root.SuiteDiskUI) root.SuiteDiskUI.download(link);
            else link.click();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
          };
          row.append(download);
        }
        for (const action of ["Rename", "Delete"]) {
          const button = document.createElement("button");
          button.textContent = action;
          button.setAttribute("aria-label", action + " " + path);
          button.onclick = async () => {
            try {
              if (working || opening || adapter.busy())
                throw Error("Finish the current operation first");
              let target = null;
              if (action === "Rename") {
                target = prompt("New project-relative path", path);
                if (!target || target === path) return;
                if (!safe(target))
                  throw Error(
                    "Use a relative path with no empty, dot or parent segments",
                  );
                const all = [...directories, ...paths];
                if (
                  all.some((p) => p === target || p.startsWith(target + "/")) ||
                  target.startsWith(path + "/") ||
                  paths.some((p) => target.startsWith(p + "/"))
                )
                  throw Error(
                    "Target already exists or is inside the source folder",
                  );
              } else if (
                !confirm(
                  "Delete " +
                    path +
                    " from this project? Previous server revisions remain on disk.",
                )
              )
                return;
              const map = (p) =>
                p === path || (isFolder && p.startsWith(path + "/"))
                  ? target === null
                    ? null
                    : target + p.slice(path.length)
                  : p;
              if (
                paths.some(
                  (p) => p === path || (isFolder && p.startsWith(path + "/")),
                )
              )
                adapter.repath(map);
              folders = folders.map(map).filter(Boolean);
              changed();
              renderTree();
              await save();
            } catch (error) {
              report(error.message);
            }
          };
          row.append(button);
        }
        tree.append(row);
      }
    }
    function save(asCopy = false) {
      if (inFlight)
        return inFlight.then(() =>
          pending() || asCopy ? save(asCopy) : undefined,
        );
      inFlight = performSave(asCopy).finally(() => {
        inFlight = null;
      });
      return inFlight;
    }
    async function performSave(asCopy = false) {
      clearTimeout(timer);
      if (opening) throw Error("Wait for the project to open");
      if (working) {
        if (asCopy) throw Error("Wait for the current save");
        return;
      }
      if (adapter.busy())
        throw Error("Finish the current import or operation before saving");
      if (blocked === "conflict" && !asCopy)
        throw Error(
          "Server save is paused. Reopen the project or save as a new project to preserve your changes.",
        );
      working = true;
      const captured = revision;
      try {
        const value = snapshot(),
          result = await request(app, {
            action: "save",
            ...(selected && !asCopy
              ? { id: selected.id, expectedRevision: selected.revision }
              : {}),
            name: adapter.name(),
            ...value,
          });
        selected = result;
        savedRevision = captured;
        blocked = false;
        try {
          localStorage.setItem(marker, result.id);
          if (!pending()) localStorage.removeItem(marker + "/pending");
        } catch {}
        panel.querySelector(".sp-root").textContent =
          "Project root: " + result.root + " · Files: " + result.filesRoot;
        report(
          "Saved on Python server · revision " +
            result.revision +
            (pending() ? " · newer edits waiting" : ""),
        );
        await refresh().catch((error) =>
          report(
            "Saved revision " +
              result.revision +
              "; project list unavailable: " +
              error.message,
          ),
        );
        renderTree();
      } catch (error) {
        blocked = error.conflict ? "conflict" : true;
        report(
          "Server save not confirmed: " +
            error.message +
            " Browser recovery and downloads remain available.",
        );
        throw error;
      } finally {
        working = false;
        if (pending() && !blocked)
          timer = setTimeout(() => save().catch(() => {}), 500);
      }
    }
    async function open(id, automatic = false) {
      if (!id) throw Error("Select a server project");
      if (working || opening || adapter.busy())
        throw Error("Finish the current operation first");
      if (
        !automatic &&
        !confirm(
          "Open this server project? Save the current project or download its recovery first if you need to keep it.",
        )
      )
        return;
      opening = true;
      clearTimeout(timer);
      const before = revision;
      try {
        const result = await request(app, { action: "open", id });
        if (before !== revision)
          throw Error(
            "Editor changed while opening; saved server contents were not applied",
          );
        suspended = true;
        try {
          await adapter.restore(clone(result.state), result.files);
          folders = result.folders;
          selected = result;
          blocked = false;
          savedRevision = revision;
          lastObserved = signature();
          try {
            localStorage.setItem(marker, id);
            localStorage.removeItem(marker + "/pending");
          } catch {}
        } finally {
          suspended = false;
        }
        panel.querySelector(".sp-root").textContent =
          "Project root: " + result.root + " · Files: " + result.filesRoot;
        report("Opened server project · revision " + result.revision);
        renderTree();
        await refresh();
      } finally {
        opening = false;
      }
    }
    for (const button of panel.querySelectorAll("[data-action]"))
      button.onclick = async () => {
        try {
          switch (button.dataset.action) {
            case "refresh":
              await refresh();
              renderTree();
              break;
            case "open":
              await open(select.value);
              break;
            case "save":
              await save();
              break;
            case "copy":
              await save(true);
              break;
            case "folder": {
              const path = folderInput.value.trim();
              if (!safe(path)) throw Error("Use a relative folder path");
              if (working || opening)
                throw Error("Wait for the current save or open");
              if (
                snapshot().files.some(
                  (f) => f.path === path || path.startsWith(f.path + "/"),
                )
              )
                throw Error("A file cannot be used as a folder");
              folders.push(path);
              changed();
              renderTree();
              await save();
              folderInput.value = "";
              break;
            }
          }
        } catch (error) {
          report(error.message);
        }
      };
    window.addEventListener("beforeunload", (event) => {
      if (pending() || working) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    lastObserved = signature();
    const ready = (async () => {
      try {
        await refresh();
        const id = cached(marker);
        if (id && !cached(marker + "/pending")) await open(id, true);
        else {
          report(
            id
              ? "Unsaved browser recovery retained. Save as a new project or open a saved project."
              : "Save to create a persistent project on the Python server.",
          );
          renderTree();
        }
      } catch (error) {
        report(error.message);
      }
    })();
    return {
      changed,
      save,
      ready,
      refresh,
      get current() {
        return selected;
      },
      get pending() {
        return pending();
      },
    };
  }
  function safe(path) {
    return (
      typeof path === "string" &&
      path.length <= 512 &&
      !/[\\:\x00-\x1f]/.test(path) &&
      !path.split("/").some((p) => !p || p === "." || p === "..")
    );
  }
  function text(file) {
    if (file.encoding !== "base64") return file.content;
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0)),
    );
  }
  function cached(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  root.SuiteServerProjects = { mount, fileRecord, request, text, cached };
})(window);
