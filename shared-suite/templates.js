/* Native templates/snippets, separate from rolling recovery retention. */
(function (root) {
  "use strict";
  const copy = (v) => JSON.parse(JSON.stringify(v));
  let opening;
  function metadata(v) {
    if (!v || typeof v.name !== "string" || !v.name.trim())
      throw Error("Enter a template name.");
    if (v.description !== undefined && typeof v.description !== "string")
      throw Error("Template description must be text.");
    const tags = typeof v.tags === "string" ? v.tags.split(",") : v.tags || [];
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))
      throw Error("Template tags must be text.");
    return {
      name: v.name.trim().slice(0, 120),
      description: (v.description || "").slice(0, 4000),
      tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(
        0,
        20,
      ),
    };
  }
  function unpack(value, tool) {
    if (
      !value ||
      value.format !== "suite-document-template/v1" ||
      value.tool !== tool ||
      !value.document ||
      typeof value.document !== "object" ||
      Array.isArray(value.document)
    )
      throw Error("Choose a template for " + tool + ".");
    return { ...metadata(value), document: copy(value.document) };
  }
  function pack(record) {
    return {
      format: "suite-document-template/v1",
      tool: record.tool,
      ...metadata(record),
      document: copy(record.document),
    };
  }
  function database() {
    if (!opening)
      opening = new Promise((resolve, reject) => {
        let failed = false;
        const request = root.indexedDB.open("agentic-suite-templates", 2);
        request.onupgradeneeded = () => {
          const store = request.result.objectStoreNames.contains("templates")
            ? request.transaction.objectStore("templates")
            : request.result.createObjectStore("templates", { keyPath: "id" });
          if (!store.indexNames.contains("tool"))
            store.createIndex("tool", "tool", { unique: false });
        };
        request.onsuccess = () => {
          const db = request.result;
          if (failed) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            opening = null;
          };
          resolve(db);
        };
        request.onerror = request.onblocked = () => {
          failed = true;
          opening = null;
          reject(
            Error(
              "Template storage is unavailable. Check browser storage or close older suite tabs.",
            ),
          );
        };
      });
    return opening;
  }
  async function transaction(mode, fn) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("templates", mode);
      let result;
      try {
        result = fn(tx.objectStore("templates"));
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () =>
        resolve(typeof result === "function" ? result() : result);
      tx.onerror = tx.onabort = () =>
        reject(
          tx.templateError ||
            tx.error ||
            Error(
              "Template storage failed. Export backups or free browser storage.",
            ),
        );
    });
  }
  async function list(tool) {
    return transaction("readonly", (s) => {
      if (typeof tool !== "string") return [];
      const r = s.index("tool").getAll(tool);
      return () =>
        r.result.sort(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) ||
            a.name.localeCompare(b.name),
        );
    });
  }
  async function put(tool, details, document) {
    const item = {
      id:
        root.crypto?.randomUUID?.() ||
        "template-" + Date.now() + "-" + Math.random(),
      tool,
      ...metadata(details),
      document: copy(document),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await transaction("readwrite", (s) => s.add(item));
    return copy(item);
  }
  async function putMany(tool, entries) {
    if (!Array.isArray(entries) || !entries.length)
      throw Error("Choose a nonempty collection.");
    const now = new Date().toISOString(),
      items = entries.map((entry) => ({
        id:
          root.crypto?.randomUUID?.() ||
          "template-" + Date.now() + "-" + Math.random(),
        tool,
        ...metadata(entry.details),
        document: copy(entry.document),
        createdAt: now,
        updatedAt: now,
      }));
    await transaction("readwrite", (store) => {
      for (const item of items) store.add(item);
    });
    return copy(items);
  }
  async function edit(id, tool, details, document) {
    const values = metadata(details),
      replacement = document === undefined ? {} : { document: copy(document) };
    return transaction("readwrite", (s) => {
      const r = s.get(id);
      r.onsuccess = () => {
        if (!r.result || r.result.tool !== tool) {
          s.transaction.templateError = Error(
            "Template does not belong to this app.",
          );
          s.transaction.abort();
          return;
        }
        s.put({
          ...r.result,
          ...values,
          ...replacement,
          updatedAt: new Date().toISOString(),
        });
      };
    });
  }
  async function remove(id, tool) {
    return transaction("readwrite", (s) => {
      const r = s.get(id);
      r.onsuccess = () => {
        if (r.result?.tool === tool) s.delete(id);
      };
    });
  }
  const api = { metadata, unpack, pack, list, put, putMany, edit, remove };
  root.SuiteTemplates = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
