(function () {
  "use strict";
  window.SuiteProjectMemoryUI = {
    attach({ button, request, settings, saveSettings, session = () => null }) {
      const el = (t, text) => {
          const n = document.createElement(t);
          if (text !== undefined) n.textContent = text;
          return n;
        },
        d = el("dialog");
      d.id = "agent-project-memory";
      d.setAttribute("aria-labelledby", "pm-heading");
      d.innerHTML =
        '<header><h2 id="pm-heading">Project memory</h2><button id="pm-close" aria-label="Close project memory">×</button></header><p>Workspace-local notes shared across sessions of the selected project. Notes are reference data, not permissions or verified facts.</p><div class="pm-toolbar"><label>Project label<input id="pm-project" maxlength="200"></label><label><input id="pm-enabled" type="checkbox">Recall relevant notes in new runs</label><button id="pm-config">Use project settings</button></div><p id="pm-scope"></p><div class="pm-toolbar"><input id="pm-query" type="search" aria-label="Find project memory" placeholder="Find decisions, constraints or lessons"><button id="pm-search">Search</button><button id="pm-list">Browse all</button><button id="pm-next" disabled>Next 30</button><button id="pm-new">New note</button><button id="pm-capture">Draft session handoff</button><button id="pm-export">Export project JSON</button><button id="pm-import">Inspect backup</button><input id="pm-file" type="file" accept="application/json,.json" hidden></div><section id="pm-listing" aria-label="Project memory results"></section><details id="pm-editor"><summary>Note editor</summary><label>Title<input id="pm-title" maxlength="160"></label><label>Category<select id="pm-category"><option value="note">Note</option><option value="decision">Decision</option><option value="constraint">Constraint</option><option value="lesson">Lesson</option><option value="task">Task</option></select></label><label>Source / evidence reference<input id="pm-source" maxlength="1000"></label><label>Note text<textarea id="pm-text" rows="8" maxlength="100000"></textarea></label><div class="pm-toolbar"><label><input id="pm-pinned" type="checkbox">Pinned</label><label><input id="pm-archived" type="checkbox">Archived</label><label>Expiry<input id="pm-expires" type="date"></label></div><div class="pm-toolbar"><button id="pm-save">Save note</button><button id="pm-delete" disabled>Delete loaded note</button></div><p id="pm-revision"></p></details><p id="pm-status" role="status" aria-live="polite"></p>';
      document.body.append(d);
      const q = (id) => d.querySelector("#" + id);
      let scope = "",
        loaded = null,
        cursor = 0,
        next = 0,
        busy = false;
      const status = (t) => (q("pm-status").textContent = t),
        fields = [
          "title",
          "text",
          "category",
          "source",
          "expires",
          "pinned",
          "archived",
        ];
      async function run(fn) {
        if (busy) return;
        busy = true;
        q("pm-save").disabled = q("pm-delete").disabled = true;
        try {
          await fn();
        } catch (e) {
          status(e.message);
        } finally {
          busy = false;
          q("pm-save").disabled = false;
          q("pm-delete").disabled = !loaded;
        }
      }
      async function api(action, extra = {}) {
        if (q("pm-project").value.trim() !== scope)
          throw Error(
            "Use project settings before accessing a different project.",
          );
        return request({
          op: "project_memory",
          project: scope,
          action,
          ...extra,
        });
      }
      function clear() {
        loaded = null;
        fields.forEach((k) => {
          const n = q("pm-" + k);
          if (n.type === "checkbox") n.checked = false;
          else n.value = k === "category" ? "note" : "";
        });
        q("pm-revision").textContent =
          "New note · saving does not start the agent.";
        q("pm-delete").disabled = true;
      }
      async function load(id) {
        const note = await api("read", { id });
        loaded = note;
        fields.forEach((k) => {
          const n = q("pm-" + k);
          if (n.type === "checkbox") n.checked = !!note[k];
          else n.value = note[k] || "";
        });
        q("pm-revision").textContent =
          "Updated " +
          note.updated +
          " · revision " +
          note.revision.slice(0, 12);
        q("pm-editor").open = true;
      }
      function rows(notes) {
        q("pm-listing").replaceChildren();
        for (const note of notes) {
          const row = el("article"),
            b = el("button", note.title);
          b.onclick = () => run(() => load(note.id));
          row.append(
            b,
            el(
              "small",
              [
                note.category,
                note.pinned ? "Pinned" : "",
                note.archived ? "Archived" : "",
                note.expires ? "Expires " + note.expires : "",
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          );
          q("pm-listing").append(row);
        }
        if (!notes.length)
          q("pm-listing").append(
            el(
              "p",
              "No matching notes. Add an explicit decision, constraint or lesson.",
            ),
          );
      }
      async function list(offset = 0) {
        const r = await api("list", { cursor: offset, limit: 30 });
        cursor = offset;
        next = r.nextCursor;
        q("pm-next").disabled = r.done;
        rows(r.notes);
        status(
          r.total +
            " saved notes · " +
            (offset + 1) +
            "–" +
            r.nextCursor +
            " · includes archived/expired entries.",
        );
      }
      button.onclick = () =>
        run(async () => {
          const cfg = settings();
          scope = cfg.project;
          q("pm-project").value = scope;
          q("pm-enabled").checked = cfg.enabled;
          q("pm-scope").textContent =
            "Active project: " +
            scope +
            " · recall changes apply on the next approved run.";
          if (!d.open) d.showModal();
          await list();
        });
      q("pm-close").onclick = () => d.close();
      q("pm-config").onclick = () =>
        run(async () => {
          const project = q("pm-project").value.trim();
          if (!project) throw Error("Enter a stable project label.");
          await saveSettings({ project, enabled: q("pm-enabled").checked });
          scope = project;
          clear();
          q("pm-scope").textContent =
            "Active project: " +
            scope +
            " · workspace-local; next-run recall " +
            (q("pm-enabled").checked ? "enabled" : "disabled");
          await list();
        });
      q("pm-list").onclick = () => run(() => list());
      q("pm-next").onclick = () => run(() => list(next));
      q("pm-search").onclick = () =>
        run(async () => {
          const r = await api("search", { query: q("pm-query").value });
          rows(r.matches);
          q("pm-next").disabled = true;
          status(
            "Relevant active notes, including up to four pinned entries. Archived/expired notes are excluded; Browse all to inspect them.",
          );
        });
      q("pm-new").onclick = () => {
        clear();
        q("pm-editor").open = true;
        q("pm-title").focus();
      };
      q("pm-capture").onclick = () => {
        const current = session();
        if (!current) {
          status("Start or load a session to draft a handoff.");
          return;
        }
        if (
          q("pm-text").value.trim() &&
          !confirm(
            "Replace the unsaved note editor with a session handoff draft?",
          )
        )
          return;
        const events = current.events || [],
          last = [...events]
            .reverse()
            .find((e) => e.kind === "assistant" && e.value?.status === "done");
        const failures = events.filter(
          (e) =>
            e.kind === "observation" &&
            (e.value?.ok === false ||
              e.value?.checks?.passed === false ||
              e.value?.result?.timedOut ||
              e.value?.result?.cancelled ||
              (Number.isInteger(e.value?.result?.exitCode) &&
                e.value.result.exitCode !== 0)),
        );
        const draft = {
          sourceSession: current.id,
          historyPartial: current.historyPartial === true,
          goal: String(current.goal || "").slice(0, 8000),
          goalTruncated: String(current.goal || "").length > 8000,
          reportedOutcome: last?.value?.outcome || current.status,
          summary: String(last?.value?.summary || "").slice(0, 4000),
          tasks: (current.tasks || []).slice(0, 100),
          observedReceipts: events.filter((e) => e.kind === "observation")
            .length,
          historicalFailureReceipts: failures.length,
          note: "Review before saving. Task flags and model summaries are not verification. Inspect current source and native receipts before reusing this memory.",
        };
        const text = JSON.stringify(draft, null, 2);
        if (text.length > 100000) {
          status(
            "Session handoff is too large. Create a focused note instead.",
          );
          return;
        }
        clear();
        q("pm-title").value = "Session handoff " + current.id.slice(0, 12);
        q("pm-category").value = "lesson";
        q("pm-source").value = "session:" + current.id;
        q("pm-text").value = text;
        q("pm-editor").open = true;
        status(
          "Session handoff drafted for review. Nothing was saved or sent automatically.",
        );
      };
      q("pm-save").onclick = () =>
        run(async () => {
          const note = Object.fromEntries(
            fields.map((k) => [
              k,
              q("pm-" + k).type === "checkbox"
                ? q("pm-" + k).checked
                : q("pm-" + k).value,
            ]),
          );
          const result = await api("save", {
            ...note,
            ...(loaded
              ? { id: loaded.id, expectedRevision: loaded.revision }
              : {}),
          });
          await load(result.id);
          await list(cursor);
          status(
            "Project note saved. No agent run or file change was started.",
          );
        });
      q("pm-delete").onclick = () =>
        run(async () => {
          if (!loaded) return;
          if (
            !confirm(
              "Delete this loaded project note? Export a backup first if needed.",
            )
          )
            return;
          await api("delete", {
            id: loaded.id,
            expectedRevision: loaded.revision,
          });
          clear();
          await list();
          status("Loaded note deleted.");
        });
      q("pm-export").onclick = () =>
        run(async () => {
          const notes = [];
          let offset = 0;
          for (;;) {
            const r = await api("list", { cursor: offset, limit: 100 });
            if (r.total > 500)
              throw Error(
                "Export supports up to 500 notes per project. Split oversized projects before exporting.",
              );
            for (const note of r.notes) {
              const value = await api("read", { id: note.id });
              if (value.revision !== note.revision)
                throw Error(
                  "Project memory changed during export. Retry the export.",
                );
              notes.push(value);
            }
            if (r.done) break;
            offset = r.nextCursor;
          }
          const text = JSON.stringify(
            { format: "suite-project-memory/v1", project: scope, notes },
            null,
            2,
          );
          if (new TextEncoder().encode(text).length > 5000000)
            throw Error(
              "The export exceeds 5 MB; split notes into smaller projects.",
            );
          const url = URL.createObjectURL(
              new Blob([text], { type: "application/json" }),
            ),
            a = el("a");
          a.href = url;
          a.download = "project-memory.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          status(
            "Project notes exported. Review sensitive notes before sharing.",
          );
        });
      q("pm-import").onclick = () => {
        q("pm-file").value = "";
        q("pm-file").click();
      };
      q("pm-file").onchange = () =>
        run(async () => {
          const f = q("pm-file").files[0];
          if (!f) return;
          if (f.size > 5000000)
            throw Error("Choose a backup smaller than 5 MB.");
          const pack = JSON.parse(await f.text());
          if (
            pack.format !== "suite-project-memory/v1" ||
            !Array.isArray(pack.notes) ||
            pack.notes.length > 500
          )
            throw Error("Choose a project-memory backup.");
          q("pm-listing").replaceChildren();
          for (const note of pack.notes) {
            if (typeof note.title !== "string" || typeof note.text !== "string")
              throw Error("Invalid backup note.");
            const b = el("button", "Inspect backup note: " + note.title);
            b.onclick = () => {
              clear();
              for (const k of fields) {
                const n = q("pm-" + k);
                if (n.type === "checkbox") n.checked = note[k] === true;
                else n.value = note[k] || "";
              }
              q("pm-editor").open = true;
              status(
                "Backup note loaded as an unsaved new note. Review project and content, then Save explicitly.",
              );
            };
            q("pm-listing").append(b);
          }
          status(
            "Backup inspected. Select a note to restore as a new copy; nothing has been imported automatically.",
          );
        });
    },
  };
})();
