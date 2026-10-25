# sheetiX

A standalone, local-first spreadsheet editor in the visual style of Architex. It runs in the browser without a build, account or server API. Excel import/export uses the existing local ExcelJS asset in `../architex/vendor/`; keep these folders together when hosting the repository.

Open `sheetiX/index.html` directly, or serve the repository with `python3 -m http.server 8000` and open `/sheetiX/`. The existing Architex server also serves this tool.

## Edit a workbook

Click a cell to select it. Type to replace its contents, double-click or press F2 to edit, or use the formula bar. Enter commits and moves down; Tab moves right. Escape cancels inline edits. Arrow keys navigate, Shift + arrows or Shift + click extend a rectangular selection, and row/column headers select the corresponding row or column. Enter a cell address or range such as `B2:D10` in the address field to jump there.

Copy selected cells and paste tab/newline-separated blocks from another spreadsheet. Copying within sheetiX preserves the raw formulas through a custom clipboard format; plain clipboard text contains displayed values. Pasted formulas retain their original references; references are not shifted automatically. Delete/Backspace clears selected values while preserving formatting. Prefix a value with an apostrophe to keep it as text, for example `'0012` or `'=A1`.

Apply bold, italic, foreground/background color, alignment and number formats to a selected range. The status bar shows the range, count of numeric cells, sum and average. Find searches raw cell contents and calculated values on the active sheet.

Use the sheet tabs and + button to manage multiple sheets. Renaming a sheet updates explicit formula references to its old name; deleting a sheet leaves references reporting `#REF!`. Undo/redo restores workbook edits. The workbook autosaves locally; history lasts only for the current session. Export important work because clearing browser storage removes the saved workbook.

Each workbook supports up to 20 sheets, with up to 200 rows × 52 columns per sheet. Sheets start at 100 × 26; add rows/columns with the toolbar. Sort A–Z/Z–A sorts whole rows by the active column. Select multiple rows to bound the sort; a single selected row sorts from that row through the last used row. Exclude a header row by starting below it. Sort moves raw formulas with their rows and retains their original references.

## Formulas

Start a formula with `=`. Calculations update when cells change, including references across sheets.

```
=B2*C2
=SUM(D2:D20)
=AVERAGE(B2:B10)
=IF(D2>100,"Above budget","Within budget")
=ROUND(D2/3,2)
='Sheet 2'!A1+Sheet1!B2
```

**106 supported functions** cover statistics, conditional summaries, logic, math, text, lookups, dates, financial calculations and value tests. Open **Functions** beside the formula bar to search the catalog and insert an editable example. While typing a function name, use Up/Down and Enter/Tab for completion. See the [complete function reference](FORMULAS.md) for signatures, examples and compatibility limits. Supported operators are `+ - * / ^ % &`, comparisons `= <> < > <= >=`, and parentheses. Double-quoted text, TRUE/FALSE and `$A$1` references are supported. Absolute `$` anchors are preserved by formula-aware Fill down/right. IF, IFS and CHOOSE evaluate only their selected result. IFERROR and IFNA support lazy fallback values. Commas or semicolons separate arguments. Formula parsing does not execute JavaScript or load external resources.

Errors include `#N/A`, `#CYCLE!`, `#DIV/0!`, `#REF!`, `#VALUE!`, `#NAME?`, `#NUM!`, `#LIMIT!` and `#ERROR!`. Unsupported Excel functions remain visible as formulas and report errors. This implements a subset of Excel: dates are text on import (date functions accept ISO text or 1900-system serial values), currency uses dollars, and advanced Excel formatting, charts, merged cells, macros, named ranges, dynamic arrays, workbook links and live collaboration are not supported. Merged-cell workbooks must be unmerged before import. Imported sheet names must fit the displayed naming rules.

## Import and export

- **XLSX:** imports/exports all sheets, raw formulas, literal values, basic fonts, colors, alignment and supported number formats. Formulas include cached results. Excel may calculate formulas differently; sheetiX supports the documented subset. Layout dimensions, custom formats and unsupported Excel features are not preserved.
- **CSV/TSV import:** quoted fields, embedded newlines and escaped quotes are supported. Import replaces the workbook with one sheet. Text starting with `=` and strings matching spreadsheet error labels are kept as literal text on import. Enter it in the formula bar if you want to calculate it.
- **CSV export:** exports the active sheet's used values with current number formatting. Text that could be interpreted as a spreadsheet formula is prefixed with an apostrophe. It does not preserve formulas, styles or other sheets.
- **Workbook JSON:** preserves the complete editable sheetiX workbook, including sheet sizes, raw formulas and styles. Use it for a faithful backup and later re-import.

Imports are limited to 8 MB. Cells support up to 32,000 characters. Failed imports leave the current workbook intact. New workbooks and successful imports can be undone. The tool does not upload workbook contents.

## Verification

`node sheetiX/formulas-test.cjs` and `node sheetiX/functions-test.cjs` run the formula-engine checks. `node sheetiX/functions-browser-test.cjs` checks completion, the function catalog, calculation, history, XLSX formula/error caches, AI signatures and mobile layout. Serve the repository on port 8000, then run `node sheetiX/browser-test.cjs` for functional checks with Playwright and Chromium at `/usr/bin/chromium`, matching the other tools' development setup. Tests cover editing, formulas, styles, history, paste, sheets, autosave, workbook exports, Excel round-trips, quoted CSV and invalid-import handling.


## Tool-specific AI chat

Discuss formulas and calculated values, analyze selected cells, create tables or propose formatting and workbook edits. The assistant receives the workbook, active sheet and selected-cell context; replacements pass workbook validation before review.

See the [shared AI chat guide](../shared-ai/README.md) for relay setup, context selection, attachments, review, Undo, request/schema downloads and troubleshooting.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Tool-specific productivity actions

Open **Workspace → Tool actions** for reviewed editing helpers, JSON/Markdown/CSV inventories and a tool-specific AI review draft. Changes use native validation and save recovery before application. See the [action catalog and interchange guide](../shared-suite/WORKSPACE.md#tool-actions-and-portable-inventories) for this app’s operations and limits.

Additional **Workspace → Tool actions** capability: Format numeric literals while preserving formulas, explicit formats and leading-zero identifiers. Review the native change preview before applying; a recovery point is saved automatically.

**Productivity extension:** Fill down or right with shifted relative formula references, preserved absolute anchors and copied styles. Use **Workspace → Tool actions** to review and apply native changes.

### Formula-aware fill

Select a rectangle with Shift-click or the range/address field. **Fill down** in
the formatting toolbar copies the top row through the selected rows; **Fill right**
copies the left column across. Formulas shift relative references; `$A1`, `A$1`
and `$A$1` preserve their column/row anchors. References inside quoted strings are
unchanged, and sheet-qualified references shift their cell coordinates. Cell styles
are copied. Destination cells are replaced; empty source cells clear destinations.
Undo/Redo and normal local persistence apply. References shifted outside valid
spreadsheet coordinates reject the entire fill. Workbook dimension/evaluator limits
still apply. The Workspace fill-column action provides an explicit review preview.

**Reusable variants:** Transpose a rectangular selection while copying styles and shifting formula references. Available through **Workspace → Tool actions**, with native validation, preview and recovery.

**Transpose copy** in the formatting toolbar swaps rows and columns into a
rectangle anchored at the selection's top-left. It copies each source cell from
an immutable snapshot, so overlapping ranges work. Relative formula references
shift by the copied cell's displacement; this is a copy-offset rule, not a
row/column rewrite of every formula reference. Absolute anchors and styles remain
intact. Cells outside the destination rectangle are retained, and empty source
cells clear their destination. Invalid destination bounds or shifted references
reject the whole operation. Undo/Redo restores previous cells. The Workspace
transpose action offers an explicit native review preview.

## Project ZIP

Use **Project ZIP** in the header, or **Workspace → Recovery → Import / export project ZIP**, to save and restore the complete native project. Choose Computer or Virtual disk. Imports validate and stage a review; applying preserves the previous project in Recovery. Embedded assets are included, while separate app/relay settings and external workspace files are excluded. See the [shared ZIP guide](../shared-suite/PROJECT-ZIP.md).


Use **Open Google Sheets** to import a native Drive spreadsheet. Select **Google Sheets · Drive** in the export format menu to save a native Google spreadsheet. Connect and approve Google Drive access first. Conversion uses DOCX/XLSX/PPTX and may simplify unsupported features. See [Google Workspace interchange](../shared-suite/GOOGLE-DRIVE.md#google-docs-sheets-and-slides).
