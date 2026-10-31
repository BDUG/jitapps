# textiX

A standalone word-style rich-text editor with an Architex-inspired workspace. It runs entirely in your browser without a build, account, service or external library.

Open `textiX/index.html` directly, or serve the repository with `python3 -m http.server 8000` and open `/textiX/`. The existing Architex server also serves this folder.

## Write and format

Click the document and start writing. Select text to apply bold, italic, underline, strikethrough, colors, highlighting, font family or font size. Choose normal paragraphs, headings, quotes or code from the paragraph-style menu. Headings populate the clickable document outline. Alignment, numbered and bulleted lists, indentation and clear inline formatting are available in the toolbar.

Insert links with complete HTTP, HTTPS, mailto or tel URLs. Insert an editable table with up to 30 rows and 12 columns, optionally with a header row. Edit its cells directly; Tab moves through cells using browser editing behavior. Insert local PNG, JPEG or WebP images up to 2 MB, horizontal rules and explicit print page breaks. Images fit within the document width. Nested table structure and complex page layouts are not supported through dedicated controls.

Undo with Ctrl/Command Z; redo with Ctrl/Command Shift Z or Ctrl/Command Y. Ctrl/Command B, I and U format text. Use **Find** (Ctrl/Command F while editing) to search, replace one occurrence, or replace all. Case-sensitive search is optional. Replacement text is inserted as text rather than interpreted as HTML. Word count, character count and estimated reading time update below the document.

The document and its name autosave in browser storage. Undo history is limited to the current session. New documents and imports can be undone. Browser storage has a size limit, particularly with embedded images; export important work and keep a backup. Clearing browser data removes the local document. There is no server upload, collaboration or cross-device synchronization.

**Focus mode** hides the header and outline; the same button exits it. Zoom changes the editing view. On narrow screens the outline is hidden and the document fits the screen. The page is a continuous editing surface; explicit page breaks affect printing. It does not provide live pagination.

## Import, export and print

- **HTML:** sanitized, editable rich-text documents, preserving supported formatting, lists, headings, tables and embedded raster images. Export produces a standalone HTML file with document styles.
- **Plain text:** imports paragraphs; exports the visible document text. Formatting and pictures are omitted.
- **Markdown:** imports headings, emphasis, inline/fenced code, basic links, lists and quotes. Export also represents tables, with image placeholders. Markdown is a simplified interchange format; complex formatting and table/image round-trips are not lossless.
- **Print / PDF:** opens the browser print dialog with an A4 print stylesheet. Select your browser's PDF destination to save a PDF. Printing omits editor controls and respects explicit page breaks.

Imports are limited to 6 MB. Pasted HTML and imported documents are sanitized: scripts, event handlers, embedded HTML applications, SVG, external stylesheets, remote images and unsafe links are removed. Supported inline presentation styles remain. Browser-native contenteditable editing provides the rich-text behavior. Legacy Word binary (.doc) and ODT files are not supported.

## Verification

Serve the repository on port 8000, then run `node textiX/browser-test.cjs`. The functional test uses Playwright and Chromium at `/usr/bin/chromium`, matching the repository's existing development setup. It covers formatting, history, headings, tables, links, find/replace, persistence, HTML/text/Markdown exports, sanitized imports, printing and mobile layout.


## Tool-specific AI chat

Draft, proofread, summarize, restructure or rewrite selected text. The assistant receives the rich-text document and selection; proposed HTML replacements are sanitized and require review.

See the [shared AI chat guide](../shared-ai/README.md) for relay setup, context selection, attachments, review, Undo, request/schema downloads and troubleshooting.

## Word DOCX

Choose **Import → Local disk / Virtual disk** to open a `.docx` file. Choose **Word DOCX** in the export format menu and click **Export**; the suite export destination controls whether it downloads or saves to the shared virtual disk. Imports replace the current document only after successful conversion and validation; **Undo** restores the previous content.

DOCX interchange supports headings, paragraphs, bold/italic/underline/strike formatting, lists, tables, hyperlinks, embedded images, and explicit page breaks. Exports also preserve supported inline fonts, sizes, colors, paragraph alignment and horizontal rules. WebP images are converted to PNG for Word compatibility. Import emphasizes document structure rather than Word's exact visual layout: custom styles, colors, floating objects, headers/footers, tracked changes, pagination, and complex merged tables may differ or be omitted. Conversion warnings appear below the document. Use HTML for the closest backup of textiX-specific formatting. Legacy `.doc` files are not supported; save them as `.docx` in Word first.

Files are processed entirely in the browser using bundled, MIT-licensed Mammoth 1.11.0 and docx 9.5.1. No conversion service or AI provider is required. Imported HTML is sanitized, external document file access is disabled, and compressed documents are checked against a 30 MB expanded / 3000 ZIP-entry limit in addition to the existing 6 MB file limit.

Verification (suite server on port 8000; Playwright, Chromium, and Python `python-docx` installed):

```sh
node textiX/docx-browser-test.cjs
node textiX/browser-test.cjs
```

The DOCX test creates an independent Word fixture, validates exported content using `python-docx`, and checks local/virtual disk round trips, images, links, lists, page breaks, Undo, and atomic invalid import rejection.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Tool-specific productivity actions

Open **Workspace → Tool actions** for reviewed editing helpers, JSON/Markdown/CSV inventories and a tool-specific AI review draft. Changes use native validation and save recovery before application. See the [action catalog and interchange guide](../shared-suite/WORKSPACE.md#tool-actions-and-portable-inventories) for this app’s operations and limits.

Additional **Workspace → Tool actions** capability: Repair skipped heading levels while preserving text, attributes and inline formatting. Review the native change preview before applying; a recovery point is saved automatically.

**Productivity extension:** Create/update a deduplicated reference list from existing external document links. Use **Workspace → Tool actions** to review and apply native changes.

**Reusable variants:** Duplicate a top-level heading section, preserving plain text and remapping copied internal anchors. Available through **Workspace → Tool actions**, with native validation, preview and recovery.

## PDF

Choose **Import** to load a `.pdf` from local or virtual disk. Text-based pages become editable paragraphs with page breaks. Original columns, fonts, tables and illustrations on text pages are not reconstructed. Pages without text are rendered as embedded images; OCR is not included. Password-protected PDFs require an unprotected copy. The existing 6 MB import limit applies. Failed conversions leave the current document intact, and Undo restores a successfully replaced document.

Select **PDF document → Export** to save an A4 PDF to the selected computer or virtual-disk destination. This renders the document as page images, preserving visible formatting and embedded images, with CSS page breaks. Exported text is not searchable or selectable. Use **Print / PDF** for browser printing, or DOCX/HTML to preserve editable source. Very long documents remain subject to browser canvas and memory limits.

Conversion runs locally using bundled PDF.js 3.11.174 (Apache-2.0; dynamic evaluation disabled) and html2pdf.js 0.10.2 (MIT, including its bundled dependencies). Licenses are in `vendor/`. No AI provider or external conversion service is used.

Run `node textiX/pdf-browser-test.cjs` with the suite server on port 8027 (or set `BASE_URL`) to check independent multipage text import, rendered export and reimport, corrupt-file rejection and Undo.

## Document templates and layout catalogue

Open **Templates & layouts** from the shared app toolbar, or **Workspace → Templates**. The built-in catalogue provides eight native documents: project brief, meeting notes, business report, proposal, decision record, business letter, professional résumé and standard operating procedure. Bracketed fields are placeholders to replace; no facts or credentials are supplied for you.

- **Preview replace** prepares the template as a replacement document. **Preview extend** appends its content to the current document, preserving the current document name. Inspect the native change review and apply selected changes explicitly. Appended internal element IDs and anchor links are renamed when necessary to avoid collisions.
- **Save editable copy** creates a browser-local template in the saved list. Use **Edit template content** to preview that copy in the document editor; apply it, edit the text and formatting, then choose **Update selected template with current content**. This updates only the selected saved entry. **Save current as new template** creates a separate variant.
- Saved templates also support reviewed extension, metadata edits, export/import and deletion. Built-ins stay unchanged; extend or fork them as saved copies.

The layout catalogue offers Professional report, Editorial reading and Compact notes. Layouts restyle the existing document using native paragraph/heading typography and table colors; they do not replace its text, links, image bytes or page-break content. Choose **Edit layout** to adjust font family, body size (12–24 px), line height (1.1–2), heading accent and table colors. Save as a new layout, update a selected saved layout, or export/import its `suite-office-layout/v1` JSON. Imported layouts populate the layout editor only; saving or applying is explicit. A sheetiX layout cannot be imported as a textiX layout.

These are native rich-text styles, not a new print-margin or multi-column page engine. Use the existing document tools for further editing. Export fidelity still depends on the chosen format. Templates/layouts persist on this browser origin; export important variants for backup or transfer. Applying changes uses the existing review and recovery workflow.

The catalogue separates **Built-in templates**, **Layouts** and **My templates** into keyboard-accessible tabs. Arrow keys switch between them; search counts and empty states reflect the active built-in/layout view. **Duplicate saved template** creates an independent stored copy without replacing the open document. Existing Workspace → Templates navigation opens the saved-template view.
