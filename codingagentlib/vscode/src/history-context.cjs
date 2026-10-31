"use strict";
const copy = (value) => JSON.parse(JSON.stringify(value));
function prepare(request, { enabled = true, budget = 80000 } = {}) {
  if (
    typeof enabled !== "boolean" ||
    !Number.isInteger(budget) ||
    budget < 8000 ||
    budget > 500000
  )
    throw Error("Invalid model-history budget");
  const original = request.events || [],
    characters = JSON.stringify(original).length,
    canRead = (request.tools || []).some(
      (t) => t.name === "read_history" || t === "read_history",
    );
  const base = {
    format: "codingagentlib/history-view/v1",
    originalEvents: original.length,
    originalCharacters: characters,
    budget,
  };
  if (!enabled || characters <= budget || !canRead)
    return {
      request: copy(request),
      metadata: {
        ...base,
        mode: !enabled ? "off" : !canRead ? "retrieval-unavailable" : "full",
        retainedEvents: original.length,
        retainedCharacters: characters,
        overBudget: characters > budget,
      },
    };
  // Avoid parsing/copying records that will be omitted from the model view.
  // This cache is per request: mutable audit records are never reused across turns.
  const source = copy({ ...request, events: [] }),
    encoded = new Map();
  const eventJSON = (index) => {
    if (!encoded.has(index))
      encoded.set(index, JSON.stringify(original[index]));
    return encoded.get(index);
  };
  const pinned = new Set();
  original.forEach((e, i) => {
    if (
      e.kind === "user" &&
      ["follow_up", "reference_files"].includes(e.value?.status)
    )
      pinned.add(i);
  });
  function last(predicate) {
    for (let i = original.length - 1; i >= 0; i--)
      if (predicate(original[i], i)) {
        pinned.add(i);
        break;
      }
  }
  if (original.length) pinned.add(original.length - 1);
  last((e) => e.kind === "user");
  last((e) => e.kind === "assistant" && Array.isArray(e.value?.tasks));
  const lastAccepted = original.findLastIndex((e) => e.kind === "assistant");
  last(
    (e, i) => i > lastAccepted && ["protocol_error", "repair"].includes(e.kind),
  );
  last((e) => e.kind === "observation" && e.value?.tool === "read_history");
  const selected = new Set(pinned);
  let used = 2;
  for (const i of selected) used += eventJSON(i).length + 1;
  for (
    let i = original.length - 1;
    i >= Math.max(0, original.length - 24);
    i--
  ) {
    if (selected.has(i)) continue;
    const size = eventJSON(i).length + 1;
    if (used + size <= budget) {
      selected.add(i);
      used += size;
    }
  }
  const indexes = [...selected].sort((a, b) => a - b),
    events = JSON.parse("[" + indexes.map(eventJSON).join(",") + "]"),
    omittedRanges = [];
  for (let i = 0; i < original.length; i++) {
    if (selected.has(i)) continue;
    const previous = omittedRanges.at(-1);
    if (previous && previous.offset + previous.count === i) previous.count++;
    else omittedRanges.push({ offset: i, count: 1 });
  }
  const ledger = { lastEdit: null, lastCommand: null, lastFailure: null };
  for (let index = original.length - 1; index >= 0; index--) {
    const event = original[index];
    if (event.kind !== "observation") continue;
    const v = event.value || {},
      r = v.result || {};
    const edit =
      !ledger.lastEdit &&
      v.ok === true &&
      [
        "write_file",
        "replace_text",
        "apply_edits",
        "delete_file",
        "restore_file",
        "write_script",
        "delete_script",
      ].includes(v.tool);
    const command =
      !ledger.lastCommand && ["run_command", "run_script"].includes(v.tool);
    const failure =
      !ledger.lastFailure &&
      (v.ok === false ||
        v.checks?.passed === false ||
        r.timedOut ||
        r.cancelled ||
        (Number.isInteger(r.exitCode) && r.exitCode !== 0));
    if (!edit && !command && !failure) continue;
    const entry = {
      eventIndex: index,
      callId: v.id || null,
      tool: v.tool || null,
      read: { tool: "read_history", args: { offset: index, limit: 1 } },
    };
    if (edit)
      ledger.lastEdit = {
        ...entry,
        path: typeof r.path === "string" ? r.path : null,
      };
    if (command)
      ledger.lastCommand = {
        ...entry,
        ok: v.ok === true,
        exitCode: Number.isInteger(r.exitCode) ? r.exitCode : null,
        timedOut: !!r.timedOut,
        cancelled: !!r.cancelled,
      };
    if (failure) ledger.lastFailure = entry;
    if (ledger.lastEdit && ledger.lastCommand && ledger.lastFailure) break;
  }

  const retainedCharacters = JSON.stringify(events).length,
    metadata = {
      ...base,
      mode: "compacted",
      retainedEvents: events.length,
      retainedCharacters,
      overBudget: retainedCharacters > budget,
      retainedEventIndexes: indexes,
      pinnedEventIndexes: [...pinned].sort((a, b) => a - b),
      omittedRanges,
      ledger,
      note: "events is a selected view, not the complete audit. retainedEventIndexes map each events entry to its original append-only session offset. Use read_history with offset/limit to retrieve omitted originals. References and statuses are not execution proof. All explicit reference-file snapshots and follow-up instructions, plus the latest user event, accepted task list, unresolved repair and history-read reply are preserved whole, even above the soft character budget. Reread current source before editing. Native permissions, IDs and completion checks remain authoritative.",
    };
  source.events = events;
  source.historyView = metadata;
  return { request: source, metadata };
}
module.exports = { prepare };
