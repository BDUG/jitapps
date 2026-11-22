# formiX · Formula studio

An offline-capable LaTeX formula notebook with live SVG previews, the suite's typography and colors, shared Workspace tools, virtual-disk files and reviewed AI chat.

Open the desktop and choose **formiX**, or browse to `/formiX/` on the suite server:

```sh
python3 server/server.py --port 8000
```

## Write and arrange formulas

Select a formula in the left notebook. Edit its LaTeX source without `$` delimiters; the preview updates after a short typing pause. **Ctrl/⌘+Enter** refreshes immediately. Use the symbol family selector to insert structures, Greek letters and operators at the source cursor. A template adds a new formula, preserving existing work.

Add, duplicate, delete and reorder formulas. Titles and notes can hold variable definitions, units and assumptions. Undo/redo covers notebook edits, source, styles, imports and New notebook. Typing is grouped into short edit batches; history is bounded to 40 snapshots and approximately 16 million serialized characters. The final formula cannot be deleted, but its source may be empty while drafting.

Font size, ink color, SVG padding and transparency are notebook settings. Preview zoom and Fit do not change export geometry. Properties, templates and symbol sections can be folded. Narrow screens stack the panels.

## Export and reopen

Choose **Export** and the destination (computer or shared virtual disk) inside its dialog:

| Format | Content |
| --- | --- |
| SVG | Selected formula as vector artwork, with local glyph paths and source metadata. Invalid/empty expressions cannot export SVG. |
| LaTeX · selected source | The selected expression as an editable `.tex` snippet. |
| LaTeX · complete notebook | Ordered formulas, escaped titles and notes in an `article` using `amsmath`/`amssymb`. |
| formiX project JSON | Complete editable notebook, IDs, active selection, notes and settings. Use this for lossless project storage. |

**Open** supports native JSON, LaTeX snippets (including `$…$`, `$$…$$`, `\(…\)` and `\[…\]` wrappers), full documents with `\[…\]` blocks, and SVG files exported by formiX. Full LaTeX imports recover display sources with generated titles; preambles, surrounding prose, custom macros and document formatting are not imported. A formiX SVG adds its embedded source/notes to the current notebook; it is not a general SVG-to-math recognizer. The shared source picker supports local and virtual-disk files.

Native JSON also preserves invalid LaTeX drafts so they can be repaired without losing source. SVG export always renders the actual selected source and shows errors explicitly. Nothing is compiled by a system TeX process. Preview uses the locally bundled MathJax base/AMS subset: fractions, roots, integrals, sums, matrices, aligned expressions, cases, text and standard symbols. Automatic package loading, links, external files and custom macro packages are disabled. Full TeX engines may support constructs outside this preview subset.

Projects support 1–200 formulas, with 20,000 source characters and 4,000 note characters per formula. File uploads accept up to 20 MiB; unsupported or oversized content produces an explicit error, rather than silently dropping formulas. Browser autosave reports quota/storage failures. Keep important projects as exported JSON or Project ZIP. If saved browser data is malformed, it is preserved and can be downloaded with **Download stored recovery**; editing remains available without overwriting that original.

## Shared workspace and AI

Use the shared **Workspace** panel for recovery points, search (enable raw/source search to include LaTeX), reviewed changes, project ZIP exchange and saved templates. Virtual disk, navigation and task tools follow the same patterns as the other suite apps. Optional Tauri desktop builds include formiX.

**AI chat** uses the existing relay; keys and providers stay in its settings. The AI receives the complete notebook schema, selected formula and current document. Proposals are validated and reviewed before application. Example:

> Add a probability reference sheet with Bayes' theorem and the normal distribution. Define variables and assumptions in notes. Keep my existing formulas.

Then ask:

> Explain which assumptions are needed for the normal distribution example. Answer without changing the notebook.

AI answers and notation suggestions are not an executed symbolic proof or numerical verification. Review mathematical meaning and assumptions as well as the visual preview.

Download the native project schema from the right panel or the shared chat's API/schema button.

## Verification

```sh
node --test formiX/model-test.cjs
node formiX/browser-test.cjs
```

The browser check starts a temporary suite server and exercises local rendering, templates, source edits, standalone SVG/LaTeX/JSON downloads, imports, invalid-source feedback, virtual-disk exchange, AI proposal review, persistence and mobile layout without paid model calls.

MathJax 3.2.2 is distributed under Apache-2.0; its license and source reference are in [`vendor/`](vendor/README.md).


## Workspace inventory and capabilities

Use **Workspace → Tool actions** to preview missing formula-title labels or outer LaTeX whitespace cleanup, and inspect/export a filterable formula inventory. Apply reviewed changes records a recovery point; inventory browsing does not alter formulas.
