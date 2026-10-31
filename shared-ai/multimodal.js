/* Shared inline-media inputs and response cards. No returned media is executable. */
(function (root) {
  "use strict";
  const imageTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]),
    audioTypes = new Set(["audio/wav", "audio/mpeg"]),
    extensions = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      wav: "audio/wav",
      mp3: "audio/mpeg",
      pdf: "application/pdf",
    };
  const filename = (s) => {
      const name = String(s || "media").replace(/[\x00-\x1f/\\]/g, "_");
      return name === "." || name === ".." ? "media.bin" : name;
    },
    kind = (mime) =>
      mime.startsWith("image/")
        ? "image"
        : mime.startsWith("audio/")
          ? "audio"
          : mime.startsWith("video/")
            ? "video"
            : "file";
  function dataUrl(value) {
    if (typeof value !== "string") throw Error("Expected inline media data.");
    const m = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
      value,
    );
    if (!m) throw Error("Invalid inline media data.");
    try {
      if (btoa(atob(m[2])) !== m[2]) throw Error();
    } catch {
      throw Error("Invalid media base64.");
    }
    return {
      mimeType: m[1],
      data: m[2],
      bytes:
        Math.floor((m[2].length * 3) / 4) -
        (m[2].endsWith("==") ? 2 : m[2].endsWith("=") ? 1 : 0),
    };
  }
  function normalizeMedia(items) {
    if (!Array.isArray(items)) throw Error("Response media must be an array.");
    return items.map((item, i) => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.mimeType !== "string" ||
        !/^\w[\w.+-]*\/[\w.+-]+$/.test(item.mimeType)
      )
        throw Error("Invalid response media type.");
      const name = filename(item.name || "response-" + (i + 1) + ".bin");
      if (item.dataUrl) {
        const parsed = dataUrl(item.dataUrl);
        if (parsed.mimeType !== item.mimeType)
          throw Error("Response media types differ.");
        return {
          name,
          kind: kind(item.mimeType),
          mimeType: item.mimeType,
          dataUrl: item.dataUrl,
          bytes: parsed.bytes,
        };
      }
      const url = new URL(item.url);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("Remote media requires an HTTPS URL without credentials.");
      return {
        name,
        kind: kind(item.mimeType),
        mimeType: item.mimeType,
        url: url.href,
      };
    });
  }
  function uniqueName(name, items) {
    const dot = name.lastIndexOf("."),
      base = dot > 0 ? name.slice(0, dot) : name,
      ext = dot > 0 ? name.slice(dot) : "";
    let n = 2,
      result = name;
    while (items.some((f) => f.name === result))
      result = base + " (" + n++ + ")" + ext;
    return result;
  }
  async function read(file, items = [], { bytes: provided } = {}) {
    const name = uniqueName(filename(file.name), items),
      declared = file.type || "",
      mime =
        imageTypes.has(declared) ||
        audioTypes.has(declared) ||
        declared === "application/pdf"
          ? declared
          : extensions[file.name.split(".").pop().toLowerCase()];
    const bytes =
      provided === undefined
        ? new Uint8Array(await file.arrayBuffer())
        : provided instanceof Uint8Array
          ? provided
          : new Uint8Array(provided);
    if (mime) {
      const parts = [];
      for (let i = 0; i < bytes.length; i += 8192)
        parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
      return {
        name,
        kind: kind(mime),
        mimeType: mime,
        dataUrl: "data:" + mime + ";base64," + btoa(parts.join("")),
        bytes: bytes.length,
      };
    }
    let content;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (content.includes("\0")) throw Error();
    } catch {
      throw Error(
        "Use PNG/JPEG/WebP/GIF images, WAV/MP3 audio, PDF, or UTF-8 text. Unsupported binary file: " +
          name,
      );
    }
    return { name, kind: "text", content };
  }
  function descriptors(items) {
    let mediaPart = 0;
    return items.map((f) => {
      if (f.dataUrl) mediaPart++;
      return f.kind === "text" || typeof f.content === "string"
        ? { name: f.name, kind: "text", content: f.content }
        : {
            name: f.name,
            kind: f.kind,
            mimeType: f.mimeType,
            bytes: f.bytes,
            ...(f.caption ? { caption: f.caption } : {}),
            ...(f.detail ? { detail: f.detail } : {}),
            mediaPart,
          };
    });
  }
  function content(text, items = []) {
    const binary = items.filter((f) => f.dataUrl);
    if (!binary.length) return text;
    return [
      { type: "text", text },
      ...binary.map((f) => {
        const p = dataUrl(f.dataUrl);
        if (imageTypes.has(p.mimeType)) {
          if (f.detail && !["auto", "low", "high"].includes(f.detail))
            throw Error("Invalid image detail setting.");
          return {
            type: "image_url",
            image_url: {
              url: f.dataUrl,
              ...(f.detail ? { detail: f.detail } : {}),
            },
          };
        }
        if (audioTypes.has(p.mimeType))
          return {
            type: "input_audio",
            input_audio: {
              data: p.data,
              format: p.mimeType === "audio/wav" ? "wav" : "mp3",
            },
          };
        if (p.mimeType === "application/pdf")
          return {
            type: "file",
            file: { filename: f.name, file_data: f.dataUrl },
          };
        throw Error(
          "This media type cannot be used as a model input: " + p.mimeType,
        );
      }),
    ];
  }
  function cleanRequest(value) {
    if (Array.isArray(value)) return value.map(cleanRequest);
    if (value && typeof value === "object") {
      const result = {};
      for (const [key, v] of Object.entries(value))
        result[key] =
          key === "attachments" && Array.isArray(v)
            ? descriptors(v)
            : key === "media" &&
                value.status === "media_response" &&
                Array.isArray(v)
              ? v.map(({ dataUrl, url, ...meta }) => meta)
              : cleanRequest(v);
      return result;
    }
    return value;
  }
  function references(events = []) {
    const files = [],
      tuples = [],
      seen = new Map(),
      terminal = Symbol("reference");
    let legacy = null;
    function duplicate(tuple) {
      // Native reference identity fields are strings/null. Keep their exact
      // values without constructing a JSON string containing entire payloads.
      // Unusual legacy fields fall back to the former JSON tuple semantics.
      if (legacy || tuple.some((v) => v !== null && typeof v !== "string")) {
        if (!legacy)
          legacy = new Set(tuples.map((value) => JSON.stringify(value)));
        const key = JSON.stringify(tuple);
        if (legacy.has(key)) return true;
        legacy.add(key);
      } else {
        let node = seen;
        for (const value of tuple) {
          if (!node.has(value)) node.set(value, new Map());
          node = node.get(value);
        }
        if (node.has(terminal)) return true;
        node.set(terminal, true);
      }
      tuples.push(tuple);
      return false;
    }
    for (const e of events)
      if (
        e.kind === "user" &&
        ["follow_up", "reference_files"].includes(e.value?.status)
      )
        for (const f of e.value.attachments || []) {
          if (
            !f ||
            typeof f.name !== "string" ||
            (!f.dataUrl && typeof f.content !== "string")
          )
            continue;
          const identity = [
            f.name,
            f.kind || "",
            f.content ?? null,
            f.dataUrl ?? null,
            f.caption ?? null,
            f.detail ?? null,
          ];
          if (duplicate(identity)) continue;
          files.push({ ...f, name: uniqueName(filename(f.name), files) });
        }
    return files;
  }
  function fromEvents(events = []) {
    return references(events).filter((f) => f.dataUrl);
  }
  function blob(item) {
    const p = dataUrl(item.dataUrl),
      bytes = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: p.mimeType });
  }
  function render(target, items, { onReference, status = () => {} } = {}) {
    for (const item of normalizeMedia(items)) {
      const card = document.createElement("div");
      card.className = "suite-media-card";
      const title = document.createElement("strong");
      title.textContent = item.name;
      card.append(title);
      if (item.dataUrl) {
        let preview;
        if (imageTypes.has(item.mimeType)) {
          preview = document.createElement("img");
          preview.src = item.dataUrl;
          preview.alt = item.name;
          preview.loading = "lazy";
        } else if (item.kind === "audio" || item.kind === "video") {
          preview = document.createElement(item.kind);
          preview.controls = true;
          preview.preload = "none";
          preview.src = item.dataUrl;
        }
        if (preview) card.append(preview);
        const actions = document.createElement("div");
        actions.className = "suite-media-actions";
        const button = (label, fn) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = label;
          b.onclick = async () => {
            try {
              await fn();
            } catch (e) {
              status(e.message);
            }
          };
          actions.append(b);
        };
        button("Download media", () => {
          const url = URL.createObjectURL(blob(item)),
            a = document.createElement("a");
          a.href = url;
          a.download = item.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        });
        button("Save to virtual disk", async () => {
          if (!root.SuiteDisk) throw Error("Virtual disk is unavailable.");
          const path = prompt("Save media to virtual disk:", item.name);
          if (!path) return;
          const existing = await SuiteDisk.get(path);
          if (existing && !confirm("Replace " + path + " on the virtual disk?"))
            return;
          await SuiteDisk.write(path, blob(item), {
            overwrite: !!existing,
            revision: existing?.revision,
          });
          status(
            "Saved " +
              path +
              ". Import it through an app’s normal file controls.",
          );
        });
        if (
          onReference &&
          (imageTypes.has(item.mimeType) ||
            audioTypes.has(item.mimeType) ||
            item.mimeType === "application/pdf")
        )
          button("Use as reference", () => onReference({ ...item }));
        card.append(actions);
      } else {
        const a = document.createElement("a");
        a.href = item.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "Open provider media ↗";
        card.append(a);
        const note = document.createElement("small");
        note.textContent =
          "Provider-hosted file; opened only when you choose the link.";
        card.append(note);
      }
      target.append(card);
    }
  }
  function referenceControls(target, file) {
    if (!file.dataUrl) return;
    const note = document.createElement("label");
    note.className = "suite-reference-option";
    note.textContent = "Reference note ";
    const input = document.createElement("input");
    input.type = "text";
    input.value = file.caption || "";
    input.placeholder = "e.g. current screen, desired layout, focus on toolbar";
    input.setAttribute("aria-label", "Reference note for " + file.name);
    input.oninput = () => {
      file.caption = input.value;
    };
    note.append(input);
    target.append(note);
    if (imageTypes.has(file.mimeType)) {
      const label = document.createElement("label");
      label.className = "suite-reference-option";
      label.textContent = "Image detail ";
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Image detail for " + file.name);
      for (const [value, text] of [
        ["auto", "Automatic"],
        ["low", "Low · overview"],
        ["high", "High · fine details"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
      select.value = file.detail || "auto";
      select.onchange = () => {
        file.detail = select.value;
      };
      label.append(select);
      target.append(label);
    }
  }
  // Queue file batches, then append to current state rather than restoring an
  // attachment snapshot captured before asynchronous reads.
  function fileLoader({ current, append }) {
    let tail = Promise.resolve();
    return (files) => {
      const batch = Array.from(files);
      const result = tail.then(async () => {
        const staged = [];
        for (const file of batch)
          staged.push(await read(file, [...current(), ...staged]));
        const names = [...current()],
          added = [];
        for (const file of staged) {
          const item = { ...file, name: uniqueName(file.name, names) };
          names.push(item);
          added.push(item);
        }
        append(added);
        return added;
      });
      tail = result.catch(() => {});
      return result;
    };
  }
  function mount({
    container,
    id,
    status = () => {},
    label = "Attach images, audio, PDF or text",
  }) {
    let items = [];
    const rootEl = document.createElement("div");
    rootEl.className = "suite-media-attachments";
    const button = document.createElement("button");
    button.type = "button";
    button.id = id + "-attach";
    button.textContent = label;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.hidden = true;
    input.id = id + "-files";
    input.dataset.diskLabel = label;
    const list = document.createElement("div");
    list.id = id + "-list";
    const rows = new WeakMap();
    function createRow(f) {
      const row = document.createElement("div");
      row.className = "suite-media-attachment";
      const text = document.createElement("span");
      text.textContent =
        f.name +
        " · " +
        (f.kind === "text"
          ? f.content.length + " characters"
          : f.kind + " · " + f.bytes + " bytes");
      row.append(text);
      if (f.kind === "image" && imageTypes.has(f.mimeType)) {
        const img = document.createElement("img");
        img.src = f.dataUrl;
        img.alt = f.name;
        img.loading = "lazy";
        img.decoding = "async";
        img.width = 42;
        img.height = 42;
        row.prepend(img);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + f.name);
      remove.onclick = () => {
        items = items.filter((v) => v !== f);
        refresh();
      };
      referenceControls(row, f);
      row.append(remove);
      return row;
    }
    function refresh() {
      const visible = items.map((file) => {
        if (!rows.has(file)) rows.set(file, createRow(file));
        return rows.get(file);
      });
      const keep = new Set(visible);
      for (const child of [...list.children]) {
        if (!keep.has(child)) child.remove();
      }
      visible.forEach((row, index) => {
        if (list.children[index] !== row) {
          list.insertBefore(row, list.children[index] || null);
        }
      });
      button.textContent = items.length ? label + " · " + items.length : label;
      list.setAttribute("aria-label", items.length + " attached references");
    }
    button.onclick = () => input.click();
    const loadFiles = fileLoader({
      current: () => items,
      append: (batch) => {
        items.push(...batch);
        refresh();
      },
    });
    input.onchange = async () => {
      const batch = [...input.files];
      input.value = "";
      try {
        await loadFiles(batch);
        status("References added.");
      } catch (e) {
        status(e.message);
      }
    };
    rootEl.append(button, input, list);
    container.append(rootEl);
    return {
      items: () => JSON.parse(JSON.stringify(items)),
      add: (f) => {
        const item = { ...f, name: uniqueName(filename(f.name), items) };
        if (item.dataUrl) dataUrl(item.dataUrl);
        items.push(item);
        refresh();
      },
      consume: (sent) => {
        const signatures = new Set(sent.map((f) => JSON.stringify(f)));
        items = items.filter((f) => !signatures.has(JSON.stringify(f)));
        refresh();
      },
    };
  }
  function mode(container, id) {
    const label = document.createElement("label");
    label.className = "suite-media-mode";
    label.append("Response ");
    const select = document.createElement("select");
    select.id = id;
    select.setAttribute("aria-label", "Response modality");
    for (const [value, text] of [
      ["text", "Text / structured edits"],
      ["image", "Text + images · supported models"],
      ["audio", "Audio + text · supported models"],
    ]) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      select.append(o);
    }
    label.append(select);
    container.append(label);
    return {
      select,
      modalities: () =>
        select.value === "text" ? ["text"] : ["text", select.value],
    };
  }
  const api = {
    read,
    fileLoader,
    content,
    cleanRequest,
    descriptors,
    normalizeMedia,
    references,
    fromEvents,
    blob,
    render,
    mount,
    mode,
    dataUrl,
    referenceControls,
  };
  root.SuiteMultimodal = api;
  if (typeof module === "object") module.exports = api;
})(typeof window === "object" ? window : globalThis);
