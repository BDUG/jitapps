/* Command preferences are local data; they never contain executable code. */
(function (root) {
  "use strict";
  const unique = (value, max) => {
    if (
      !Array.isArray(value) ||
      value.length > max ||
      value.some((id) => typeof id !== "string" || !id || id.length > 180)
    )
      throw Error("Invalid command preferences.");
    return [...new Set(value)];
  };
  function validate(value) {
    if (!value || value.version !== 1)
      throw Error("Unknown command preference version.");
    return {
      version: 1,
      pinned: unique(value.pinned, 32),
      recent: unique(value.recent, 12),
    };
  }
  function pin(value, id) {
    const next = validate(value);
    if (!next.pinned.includes(id) && next.pinned.length >= 32)
      throw Error("Pin up to 32 commands. Unpin one before adding another.");
    next.pinned = next.pinned.includes(id)
      ? next.pinned.filter((v) => v !== id)
      : [...next.pinned, id];
    return validate(next);
  }
  function remember(value, id) {
    const next = validate(value);
    next.recent = [id, ...next.recent.filter((v) => v !== id)].slice(0, 12);
    return validate(next);
  }
  function select(commands, value, query = "", filter = "all") {
    const preferences = validate(value),
      terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean),
      pinned = new Set(preferences.pinned),
      recent = new Map(preferences.recent.map((id, index) => [id, index]));
    return commands
      .map((item, index) => ({ item, index }))
      .filter(({ item: [label, , id] }) => {
        if (
          (filter === "pinned" && !pinned.has(id)) ||
          (filter === "recent" && !recent.has(id))
        )
          return false;
        const text = terms.length ? label.toLowerCase() : "";
        return terms.every((word) => text.includes(word));
      })
      .sort((a, b) => {
        const ai = recent.get(a.item[2]) ?? 999,
          bi = recent.get(b.item[2]) ?? 999;
        if (filter === "recent") return ai - bi;
        return (
          Number(pinned.has(b.item[2])) - Number(pinned.has(a.item[2])) ||
          ai - bi ||
          a.index - b.index
        );
      })
      .map(({ item }) => item);
  }
  const api = { validate, pin, remember, select };
  root.SuiteCommandPreferences = api;
  if (typeof module === "object") module.exports = api;
})(globalThis);
