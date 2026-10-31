/* Layout definitions and native document extension helpers for textiX / sheetiX. */
(function (root) {
  "use strict";
  const copy = (v) => JSON.parse(JSON.stringify(v)),
    tools = ["textiX", "sheetiX"];
  function layout(tool, value) {
    if (
      !tools.includes(tool) ||
      !value ||
      value.format !== "suite-office-layout/v1" ||
      value.tool !== tool ||
      !value.properties
    )
      throw Error("Choose a layout for " + tool + ".");
    const p = value.properties,
      result = {};
    for (const key of [
      "accent",
      "textColor",
      "headerFill",
      "headerText",
      "bandFill",
    ]) {
      if (typeof p[key] !== "string" || !/^#[\da-f]{6}$/i.test(p[key]))
        throw Error("Layout colors must be six-digit hex values.");
      result[key] = p[key];
    }
    if (tool === "textiX") {
      if (
        !["Arial", "Georgia", "Verdana", "Courier New"].includes(
          p.fontFamily,
        ) ||
        !Number.isFinite(p.fontSize) ||
        p.fontSize < 12 ||
        p.fontSize > 24 ||
        !Number.isFinite(p.lineHeight) ||
        p.lineHeight < 1.1 ||
        p.lineHeight > 2
      )
        throw Error(
          "Choose a supported font, 12–24 pixel body size and 1.1–2 line height.",
        );
      Object.assign(result, {
        fontFamily: p.fontFamily,
        fontSize: p.fontSize,
        lineHeight: p.lineHeight,
      });
    }
    return { format: "suite-office-layout/v1", tool, properties: result };
  }
  function applyLayout(tool, document, properties) {
    const p = layout(tool, {
        format: "suite-office-layout/v1",
        tool,
        properties,
      }).properties,
      d = copy(document);
    if (tool === "textiX") {
      if (!root.DOMParser) throw Error("Document layouts require a browser.");
      const doc = new root.DOMParser().parseFromString(d.html, "text/html");
      let paragraph = null;
      const inline = new Set([
        "A",
        "SPAN",
        "B",
        "STRONG",
        "I",
        "EM",
        "U",
        "S",
        "CODE",
        "FONT",
        "IMG",
        "BR",
        "SUB",
        "SUP",
      ]);
      for (const n of [...doc.body.childNodes]) {
        if (
          (n.nodeType === 3 && n.textContent.trim()) ||
          (n.nodeType === 1 && inline.has(n.tagName))
        ) {
          if (!paragraph) {
            paragraph = doc.createElement("p");
            n.before(paragraph);
          }
          paragraph.append(n);
        } else if (n.nodeType === 3 && paragraph) paragraph.append(n);
        else paragraph = null;
      }
      for (const e of doc.body.querySelectorAll(
        "p,div,li,blockquote,td,th,h1,h2,h3,h4,h5,h6",
      )) {
        e.style.fontFamily = p.fontFamily;
        e.style.lineHeight = String(p.lineHeight);
        e.style.color = /^H[1-6]$/.test(e.tagName) ? p.accent : p.textColor;
        e.style.fontSize =
          (/^H[1-6]$/.test(e.tagName)
            ? Math.max(
                p.fontSize,
                p.fontSize * (1.8 - (Number(e.tagName[1]) - 1) * 0.16),
              )
            : p.fontSize) + "px";
      }
      for (const e of doc.body.querySelectorAll("th")) {
        e.style.backgroundColor = p.headerFill;
        e.style.color = p.headerText;
      }
      for (const table of doc.body.querySelectorAll("table"))
        [...table.querySelectorAll("tbody tr")].forEach((row, index) => {
          for (const td of row.querySelectorAll("td"))
            td.style.backgroundColor = index % 2 === 0 ? p.bandFill : "#ffffff";
        });
      d.html = doc.body.innerHTML;
    } else
      for (const s of d.sheets) {
        const rows = Object.entries(s.cells)
            .filter(([, c]) => String(c.value).trim())
            .map(([a]) => Number(a.match(/\d+$/)?.[0]))
            .filter(Number.isFinite),
          first = rows.length ? Math.min(...rows) : 1;
        for (const [address, cell] of Object.entries(s.cells)) {
          const row = Number(address.match(/\d+$/)[0]);
          cell.style = {
            ...cell.style,
            textColor:
              row === first
                ? p.headerText
                : String(cell.value).startsWith("=")
                  ? p.accent
                  : p.textColor,
            background:
              row === first
                ? p.headerFill
                : (row - first) % 2
                  ? p.bandFill
                  : "#ffffff",
            ...(row === first ? { bold: true } : {}),
          };
        }
      }
    return d;
  }
  function rewrite(formula, names) {
    if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
    let out = "",
      i = 0;
    while (i < formula.length) {
      if (formula[i] === '"') {
        const start = i++;
        while (i < formula.length) {
          if (formula[i++] === '"') {
            if (formula[i] === '"') {
              i++;
              continue;
            }
            break;
          }
        }
        out += formula.slice(start, i);
        continue;
      }
      const match =
        /^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_]*))!(?=\$?[A-Za-z]{1,3}\$?[1-9]\d*)/.exec(
          formula.slice(i),
        );
      if (match && !/[\w.]/.test(formula[i - 1] || "")) {
        const name = match[1]?.replace(/''/g, "'") || match[2],
          replacement = names.get(name.toLowerCase());
        out += replacement
          ? "'" + replacement.replaceAll("'", "''") + "'!"
          : match[0];
        i += match[0].length;
      } else out += formula[i++];
    }
    return out;
  }
  function extend(tool, current, incoming) {
    const d = copy(current),
      addition = copy(incoming);
    if (tool === "textiX") {
      if (!root.DOMParser)
        throw Error("Document extension requires a browser.");
      const before = new root.DOMParser().parseFromString(d.html, "text/html"),
        after = new root.DOMParser().parseFromString(
          addition.html,
          "text/html",
        ),
        used = new Set([...before.querySelectorAll("[id]")].map((e) => e.id)),
        local = new Set(),
        renames = new Map();
      for (const e of after.querySelectorAll("[id]")) {
        const old = e.id;
        if (local.has(old))
          throw Error(
            "Template contains duplicate element IDs. Edit its document before extending.",
          );
        local.add(old);
        let id = old,
          n = 2;
        while (used.has(id)) id = old.slice(0, 85) + "-copy-" + n++;
        if (id !== old) renames.set(old, id);
        e.id = id;
        used.add(id);
      }
      for (const a of after.querySelectorAll('a[href^="#"]')) {
        const target = a.getAttribute("href").slice(1);
        if (renames.has(target))
          a.setAttribute("href", "#" + renames.get(target));
      }
      d.html += "\n<hr>\n" + after.body.innerHTML;
      return d;
    }
    if (tool !== "sheetiX") throw Error("Unsupported office catalogue.");
    if (d.sheets.length + addition.sheets.length > 20)
      throw Error("Extending would exceed the 20-sheet workbook limit.");
    const incomingNames = new Set();
    for (const s of addition.sheets) {
      const name = s.name.toLowerCase();
      if (incomingNames.has(name))
        throw Error(
          "Template contains duplicate sheet names. Edit it before extending.",
        );
      incomingNames.add(name);
    }
    const used = new Set(d.sheets.map((s) => s.name.toLowerCase())),
      names = new Map();
    for (const s of addition.sheets) {
      let name = s.name,
        n = 2;
      while (used.has(name.toLowerCase())) {
        const suffix = " " + n++;
        name = s.name.slice(0, 31 - suffix.length) + suffix;
      }
      used.add(name.toLowerCase());
      names.set(s.name.toLowerCase(), name);
      s.name = name;
      s.id =
        "sheet-" +
        (root.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    }
    for (const s of addition.sheets)
      for (const c of Object.values(s.cells)) c.value = rewrite(c.value, names);
    d.sheets.push(...addition.sheets);
    return d;
  }
  const api = { layout, applyLayout, extend, rewrite };
  root.SuiteOfficeCatalogue = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
