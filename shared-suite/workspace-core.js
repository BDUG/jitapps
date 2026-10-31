/* Pure workspace operations shared by every editor. */
(function (root) {
  "use strict";
  const copy = (value) => JSON.parse(JSON.stringify(value)),
    FORMAT = "agentic-suite-workspace";
  function envelope(tool, document) {
    return {
      format: FORMAT,
      version: 1,
      tool,
      createdAt: new Date().toISOString(),
      document: copy(document),
    };
  }
  function unwrap(value, tool) {
    if (
      !value ||
      value.format !== FORMAT ||
      value.version !== 1 ||
      value.tool !== tool ||
      !value.document ||
      typeof value.document !== "object" ||
      Array.isArray(value.document)
    )
      throw Error("Choose a version 1 workspace backup for " + tool + ".");
    return copy(value.document);
  }
  function diff(before, after) {
    const changes = [],
      path = [];
    function walk(a, b) {
      if (a === b) return;
      if (
        a &&
        b &&
        typeof a === "object" &&
        typeof b === "object" &&
        Array.isArray(a) === Array.isArray(b)
      ) {
        // Custom serializers retain the previous equality behavior. Plain
        // workspace objects can be compared without serializing subtrees.
        if (
          (typeof a.toJSON === "function" || typeof b.toJSON === "function") &&
          JSON.stringify(a) === JSON.stringify(b)
        )
          return;
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          path.push(key);
          walk(
            Object.hasOwn(a, key) ? a[key] : undefined,
            Object.hasOwn(b, key) ? b[key] : undefined,
          );
          path.pop();
        }
      } else if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes.push({
          path: path.join("."),
          segments: [...path],
          before: a,
          after: b,
        });
      }
    }
    walk(before, after);
    return changes;
  }
  function selectChanges(before, after, indices) {
    const changes = diff(before, after);
    if (
      !Array.isArray(indices) ||
      indices.some((i) => !Number.isInteger(i) || i < 0 || i >= changes.length)
    )
      throw Error("Choose valid changed fields.");
    const selected = new Set(
        indices.map((i) => JSON.stringify(changes[i].segments)),
      ),
      clone = (v) => (v === undefined ? undefined : copy(v));
    // Most reviews apply every change. Preserve isolation with one copy rather
    // than reconstructing every unchanged object through the partial merger.
    if (!selected.size) return clone(before);
    if (selected.size === changes.length) return clone(after);
    function merge(a, b, path) {
      if (selected.has(JSON.stringify(path))) return clone(b);
      if (
        a &&
        b &&
        typeof a === "object" &&
        typeof b === "object" &&
        Array.isArray(a) === Array.isArray(b)
      ) {
        const value = Array.isArray(a) ? [] : {};
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const next = merge(
            Object.hasOwn(a, key) ? a[key] : undefined,
            Object.hasOwn(b, key) ? b[key] : undefined,
            [...path, key],
          );
          if (next !== undefined)
            Object.defineProperty(value, key, {
              value: next,
              enumerable: true,
              writable: true,
              configurable: true,
            });
        }
        return Array.isArray(value)
          ? value.filter((_, i) => Object.hasOwn(value, i))
          : value;
      }
      return clone(a);
    }
    return merge(before, after, []);
  }
  function stats(doc) {
    const result = {
      objects: 0,
      arrays: 0,
      strings: 0,
      characters: 0,
      embeddedAssets: 0,
      bytes: new TextEncoder().encode(JSON.stringify(doc)).length,
    };
    function walk(v) {
      if (typeof v === "string") {
        result.strings++;
        result.characters += v.length;
        if (v.startsWith("data:")) result.embeddedAssets++;
      } else if (v && typeof v === "object") {
        result[Array.isArray(v) ? "arrays" : "objects"]++;
        Object.values(v).forEach(walk);
      }
    }
    walk(doc);
    return result;
  }
  const labels = new Set([
    "name",
    "label",
    "text",
    "notes",
    "description",
    "owner",
    "resource",
    "title",
    "brief",
    "query",
    "researchQuestion",
    "reportQuery",
    "answer",
    "summary",
    "conclusion",
    "heading",
    "caption",
    "alt",
    "content",
    "value",
    "html",
    "svg",
    "css",
    "js",
  ]);
  const protectedSections = new Set([
    "assets",
    "media",
    "library",
    "reportSources",
    "ruleLibrary",
  ]);
  const sourceFields = new Set(["css", "js", "content"]);
  function fields(doc, { code = false } = {}) {
    const result = [],
      path = [];
    function walk(value) {
      if (typeof value === "string") {
        const key = path.at(-1);
        if (
          labels.has(key) &&
          !value.startsWith("data:") &&
          (!sourceFields.has(key) || code) &&
          (!value.startsWith("=") || code)
        )
          result.push({
            path: [...path],
            value,
            markup: key === "html" ? "html" : key === "svg" ? "svg" : null,
            raw: code,
          });
        return;
      }
      if (value && typeof value === "object") {
        for (const key of Object.keys(value)) {
          // Protected content is never searched, even when raw source is enabled.
          if (protectedSections.has(key)) continue;
          path.push(key);
          walk(value[key]);
          path.pop();
        }
      }
    }
    walk(doc);
    return result;
  }
  function textParts(field) {
    if (!field.markup || field.raw || typeof DOMParser === "undefined")
      return [{ text: field.value, set: (value) => value }];
    const xml = field.markup === "svg",
      doc = new DOMParser().parseFromString(
        field.value,
        xml ? "image/svg+xml" : "text/html",
      ),
      base = xml ? doc.documentElement : doc.body;
    if (doc.querySelector("parsererror")) return [];
    const walker = doc.createTreeWalker(base, 4),
      nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!["script", "style"].includes(node.parentElement?.localName))
        nodes.push(node);
    }
    return { doc, base, xml, nodes };
  }
  function searchPattern(query, matchCase, wholeWord = false) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      wholeWord
        ? "(?<![\\p{L}\\p{N}\\p{M}_])" + escaped + "(?![\\p{L}\\p{N}\\p{M}_])"
        : escaped,
      matchCase ? "gu" : "giu",
    );
  }
  function occurrences(text, pattern) {
    return [...text.matchAll(pattern)].map((match) => match.index);
  }
  function scopedFields(doc, options) {
    if (
      options.fieldPath !== undefined &&
      typeof options.fieldPath !== "string"
    )
      throw Error("Field scope must be text");
    const scope = options.fieldPath || "";
    return fields(doc, options).filter(
      (f) => !scope || f.path.join(".").includes(scope),
    );
  }
  function textMatches(text, query, options = {}) {
    return (
      !query ||
      searchPattern(query, !!options.matchCase, !!options.wholeWord).test(text)
    );
  }
  function search(doc, query, options = {}) {
    if (!query) return [];
    const results = [],
      pattern = searchPattern(query, !!options.matchCase, !!options.wholeWord);
    for (const f of scopedFields(doc, options)) {
      const parts = textParts(f),
        texts = Array.isArray(parts)
          ? parts.map((p) => p.text)
          : parts.nodes.map((n) => n.data);
      for (const [part, text] of texts.entries())
        for (const position of occurrences(text, pattern))
          results.push({
            path: f.path.join("."),
            part,
            position,
            excerpt: text.slice(
              Math.max(0, position - 50),
              position + query.length + 80,
            ),
          });
    }
    return results;
  }
  function replace(doc, query, replacement, options = {}) {
    if (!query) throw Error("Enter text to find.");
    const next = copy(doc),
      pattern = searchPattern(query, !!options.matchCase, !!options.wholeWord);
    let count = 0;
    function change(text) {
      const positions = occurrences(text, pattern);
      count += positions.length;
      if (!positions.length) return text;
      const chunks = [];
      let offset = 0;
      for (const position of positions) {
        chunks.push(text.slice(offset, position), replacement);
        offset = position + query.length;
      }
      chunks.push(text.slice(offset));
      return chunks.join("");
    }
    for (const f of scopedFields(next, options)) {
      const initialCount = count,
        parts = textParts(f);
      let value;
      if (Array.isArray(parts)) value = change(f.value);
      else {
        for (const node of parts.nodes) node.data = change(node.data);
        value = parts.xml
          ? new XMLSerializer().serializeToString(parts.base)
          : parts.base.innerHTML;
      }
      if (count === initialCount) continue;
      let parent = next;
      for (const key of f.path.slice(0, -1)) parent = parent[key];
      parent[f.path.at(-1)] = value;
    }
    return { document: next, count };
  }
  root.SuiteWorkspaceCore = {
    copy,
    envelope,
    unwrap,
    diff,
    stats,
    fields,
    search,
    replace,
    textMatches,
    selectChanges,
  };
  if (typeof module !== "undefined") module.exports = root.SuiteWorkspaceCore;
})(typeof window === "undefined" ? globalThis : window);
