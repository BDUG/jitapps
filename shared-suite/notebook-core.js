/* Portable app-scoped planning notes. No document edits or tool execution. */
(function (root) {
  "use strict";
  function validateDocument(raw, allowIncomplete = false) {
    if (
      !raw ||
      raw.format !== "suite-notebook/v1" ||
      typeof raw.tool !== "string" ||
      !raw.tool ||
      typeof raw.title !== "string" ||
      typeof raw.notes !== "string" ||
      !Array.isArray(raw.tasks)
    )
      throw Error("Choose a suite notebook JSON file.");
    const ids = new Set();
    const tasks = raw.tasks.map((t) => {
      if (
        !t ||
        typeof t.id !== "string" ||
        !t.id ||
        ids.has(t.id) ||
        typeof t.text !== "string" ||
        (!allowIncomplete && !t.text.trim()) ||
        typeof t.done !== "boolean"
      )
        throw Error(
          "Each task needs a unique ID, nonempty text and completion flag.",
        );
      ids.add(t.id);
      return { id: t.id, text: t.text, done: t.done };
    });
    return {
      format: "suite-notebook/v1",
      tool: raw.tool,
      title: raw.title,
      notes: raw.notes,
      tasks,
    };
  }
  function validate(raw) {
    return validateDocument(raw);
  }
  const draftLimit = 1000000;
  function readDraft(raw, tool) {
    if (
      typeof raw !== "string" ||
      new TextEncoder().encode(raw).length > draftLimit
    )
      throw Error("Notebook recovery copies are limited to 1 MB.");
    const value = JSON.parse(raw);
    if (
      !value ||
      value.format !== "suite-notebook-draft/v1" ||
      (value.baseRaw !== null && typeof value.baseRaw !== "string") ||
      typeof value.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.updatedAt))
    )
      throw Error("Invalid notebook recovery copy.");
    const doc = validateDocument(value.doc, true);
    if (doc.tool !== tool)
      throw Error("Notebook recovery copy belongs to another app.");
    return {
      format: value.format,
      baseRaw: value.baseRaw,
      updatedAt: value.updatedAt,
      doc,
    };
  }
  function draft(baseRaw, doc) {
    const raw = JSON.stringify({
      format: "suite-notebook-draft/v1",
      baseRaw,
      updatedAt: new Date().toISOString(),
      doc: validateDocument(doc, true),
    });
    readDraft(raw, doc.tool);
    return raw;
  }
  function empty(tool) {
    return validate({
      format: "suite-notebook/v1",
      tool,
      title: "Workspace notes",
      notes: "",
      tasks: [],
    });
  }
  function markdown(raw) {
    const d = validate(raw);
    return (
      "# " +
      d.title +
      "\n\nApp: " +
      d.tool +
      "\n\n" +
      d.notes +
      "\n\n## Tasks\n\n" +
      d.tasks
        .map(
          (t) =>
            "- [" + (t.done ? "x" : " ") + "] " + t.text.replace(/\r?\n/g, " "),
        )
        .join("\n") +
      "\n"
    );
  }
  function merge(current, incoming) {
    const a = validate(current),
      b = validate(incoming),
      existing = new Map(a.tasks.map((t) => [t.id, t]));
    for (const t of b.tasks) {
      if (existing.has(t.id)) {
        const old = existing.get(t.id);
        if (JSON.stringify(old) !== JSON.stringify(t))
          throw Error(
            "Conflicting task ID " +
              t.id +
              ". Replace the notebook or resolve the conflict in the source first.",
          );
      } else {
        a.tasks.push(t);
        existing.set(t.id, t);
      }
    }
    a.notes = [a.notes, b.notes]
      .filter(Boolean)
      .filter((text, i, list) => list.indexOf(text) === i)
      .join("\n\n");
    return a;
  }
  const api = { validate, empty, markdown, merge, draft, readDraft };
  root.SuiteNotebookCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
