/* Portable app-scoped planning notes. No document edits or tool execution. */
(function (root) {
  "use strict";
  function validate(raw) {
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
        !t.text.trim() ||
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
  const api = { validate, empty, markdown, merge };
  root.SuiteNotebookCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
