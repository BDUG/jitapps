/* App-scoped view preferences only. Never contains native documents. */
(function (root) {
  "use strict";
  function parse(raw) {
    if (raw === null)
      return { format: "suite-catalogue-view/v1", pinned: [], recent: [] };
    let v;
    try {
      v = JSON.parse(raw);
    } catch {
      throw Error(
        "Catalogue view preferences are unreadable. Reset view preferences to start fresh.",
      );
    }
    if (
      v?.format !== "suite-catalogue-view/v1" ||
      !["pinned", "recent"].every(
        (k) =>
          Array.isArray(v[k]) &&
          v[k].length <= 100 &&
          v[k].every(
            (id) => typeof id === "string" && id.length > 0 && id.length <= 200,
          ),
      )
    )
      throw Error(
        "Catalogue view preferences are invalid. Reset view preferences to start fresh.",
      );
    return {
      format: v.format,
      pinned: [...new Set(v.pinned)],
      recent: [...new Set(v.recent)].slice(0, 20),
    };
  }
  function pin(prefs, key) {
    const v = parse(JSON.stringify(prefs));
    if (v.pinned.includes(key)) v.pinned = v.pinned.filter((id) => id !== key);
    else {
      if (v.pinned.length >= 100)
        throw Error("Unpin an entry before adding more than 100 favourites.");
      v.pinned.push(key);
    }
    return parse(JSON.stringify(v));
  }
  function setPinned(prefs, key, wanted) {
    if (typeof wanted !== "boolean") throw Error("Pin state must be boolean.");
    const current = parse(JSON.stringify(prefs));
    return current.pinned.includes(key) === wanted
      ? current
      : pin(current, key);
  }
  function remember(prefs, key) {
    const v = parse(JSON.stringify(prefs));
    v.recent = [key, ...v.recent.filter((id) => id !== key)].slice(0, 20);
    return parse(JSON.stringify(v));
  }
  function select(
    entries,
    prefs,
    { query = "", view = "all", kind = "" } = {},
  ) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean),
      pin = new Set(prefs.pinned),
      recent = new Map(prefs.recent.map((key, i) => [key, i]));
    const result = entries.filter((e) => {
      if (
        (kind && e.kind !== kind) ||
        (view === "pinned" && !pin.has(e.key)) ||
        (view === "recent" && !recent.has(e.key))
      )
        return false;
      if (!words.length) return true;
      const text = [
        e.name,
        e.description,
        e.kind,
        (e.tags || []).join(" "),
        e.origin || "",
      ]
        .join(" ")
        .toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
    if (view === "recent")
      result.sort((a, b) => recent.get(a.key) - recent.get(b.key));
    else result.sort((a, b) => Number(pin.has(b.key)) - Number(pin.has(a.key)));
    return result;
  }
  const api = { parse, pin, setPinned, remember, select };
  root.SuiteCataloguePreferences = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
