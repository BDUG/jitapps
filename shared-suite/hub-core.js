/* Shared navigation and inventory queries; never mutates an app document. */
(function (root) {
  "use strict";
  function preferences(value = {}) {
    const ids = (v) =>
      Array.isArray(v)
        ? [
            ...new Set(
              v.filter(
                (s) =>
                  typeof s === "string" && /^[a-zA-Z][a-zA-Z0-9]*$/.test(s),
              ),
            ),
          ].slice(0, 64)
        : [];
    return {
      version: 1,
      density: value?.density === "compact" ? "compact" : "comfortable",
      reduceMotion: value?.reduceMotion === true,
      favorites: ids(value?.favorites),
      recent: ids(value?.recent),
    };
  }
  function appSearch(apps, query = "", prefs = {}) {
    const terms = String(query)
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean),
      p = preferences(prefs);
    return apps
      .filter((app) => {
        if (!terms.length) return true;
        const text = [app.name, app.category, app.description]
          .join(" ")
          .toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
      })
      .map((app) => ({
        ...app,
        favorite: p.favorites.includes(app.id),
        recent: p.recent.indexOf(app.id),
      }))
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          (a.recent < 0 ? 100 : a.recent) - (b.recent < 0 ? 100 : b.recent) ||
          a.name.localeCompare(b.name),
      );
  }
  const quickActions = [
    {
      id: "tasks",
      target: "suite-tasks-open",
      label: "Tasks across apps",
      description: "Search, edit and export saved notebook checklists.",
      keywords: "tasks notes todo planning",
    },
    {
      id: "review",
      target: "suite-review-open",
      label: "Review current work",
      description: "Inspect advisory findings without changing the document.",
      keywords: "review quality preflight audit issues",
    },
    {
      id: "catalogue",
      target: "suite-catalogue-open",
      label: "Templates & layouts",
      description: "Browse native starting points, layouts and saved copies.",
      keywords: "catalogue catalog template layout starter presets",
    },
    {
      id: "workspace",
      target: "suite-workspace-open",
      label: "Workspace commands",
      description: "Find editing actions, recovery points and project tools.",
      keywords: "workspace command find replace backup restore undo",
    },
    {
      id: "disk",
      target: "suite-disk-open",
      label: "Virtual disk",
      description: "Browse saved files and import or export.",
      keywords: "disk files storage import export",
    },
  ];
  function actionTargets() {
    return quickActions.map((action) => action.target);
  }
  function actionSearch(availableIds, query = "") {
    const available = new Set(availableIds),
      terms = String(query)
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    return quickActions
      .filter((action) => {
        const text = [action.label, action.description, action.keywords]
          .join(" ")
          .toLocaleLowerCase();
        return (
          available.has(action.target) &&
          terms.every((term) => text.includes(term))
        );
      })
      .map((action) => ({ ...action }));
  }
  function inventory(
    rows,
    { query = "", sort = "original", offset = 0, limit = 25 } = {},
  ) {
    if (
      !Array.isArray(rows) ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw Error("Use inventory rows and a valid page range.");
    const terms = String(query)
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const label = (row) =>
      String(
        row.name ??
          row.title ??
          row.topic ??
          row.label ??
          row.path ??
          row.id ??
          row.type ??
          "",
      );
    let entries = rows
      .map((row, index) => ({ index, row }))
      .filter(({ row }) => {
        if (!terms.length) return true;
        const text = JSON.stringify(row).toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
      });
    if (sort === "label") {
      const compare = new Intl.Collator(undefined, { numeric: true }).compare;
      entries.sort(
        (a, b) => compare(label(a.row), label(b.row)) || a.index - b.index,
      );
    } else if (sort === "type")
      entries.sort(
        (a, b) =>
          String(a.row.kind ?? a.row.type ?? "").localeCompare(
            String(b.row.kind ?? b.row.type ?? ""),
          ) || a.index - b.index,
      );
    else if (sort !== "original")
      throw Error("Choose original, label or type ordering.");
    const start = Math.min(
        offset,
        Math.max(0, Math.ceil(entries.length / limit) - 1) * limit,
      ),
      page = entries.slice(start, start + limit);
    return {
      total: rows.length,
      matched: entries.length,
      offset: start,
      limit,
      entries: page,
      all: entries,
    };
  }
  const api = {
    preferences,
    appSearch,
    inventory,
    actionTargets,
    actionSearch,
  };
  root.SuiteHubCore = api;
  if (typeof module === "object") module.exports = api;
})(globalThis);
