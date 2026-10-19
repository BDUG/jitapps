# presentiX

A local-first, PowerPoint-style presentation studio in the agentic desktop suite. Create editable slide decks, rehearse in presentation mode, exchange PPTX files, and collaborate with a slide-aware AI assistant. No build, account or package installation is needed for the editor or PPTX interchange.

## Start

From the repository root:

```sh
python3 server/server.py
```

Open the `/presentiX/` path on that server (default port 8000). Keep the repository folders together: the tool reuses the vendored JSZip library and shared AI chat. Opening `presentiX/index.html` directly also supports local editing and PPTX import/export; same-origin HTTP hosting is recommended for AI chat.

## Build and edit a deck

- Use the slide thumbnails to switch slides. **＋** adds a slide; **Duplicate**, **Delete**, **↑** and **↓** manage slide order. Delete and New deck ask for confirmation.
- Add **Text**, **Rectangle**, **Ellipse** or a raster **Image**. Click an object to select it, drag to move it, and drag its corner handle to resize. Arrow keys nudge a selected object; hold Shift for 10-pixel steps.
- The right panel edits text, position, size, rotation, font size, bold, text color, fill and alignment. Objects can be duplicated, deleted or moved forward/back. Fine-grained properties require a wider window; the panel is hidden on narrow screens.
- Set each slide's title, background and speaker notes. Select 16:9 or 4:3 format; this changes the canvas height and preserves object coordinates, so review placements after switching format.
- Fit zoom follows the available canvas size. Fixed zoom levels allow closer editing with canvas scrolling.
- **Undo / Redo** or Ctrl/Command Z / Shift Z restore document edits, slide operations and applied AI proposals. History lasts for the page session.

Changes autosave to this browser's storage. Storage has a size limit, especially for image-heavy decks. Export important work; clearing browser data removes the saved deck. JSON backups preserve the full editable presentiX model. No files are written automatically to your disk.

## Present

**▶ Present** opens the active slide in a window-filling presentation view. Previous/Next, arrow keys, Page Up/Down and Space navigate; Escape exits. Speaker notes remain private to the editor and are not shown on the presentation canvas. The viewer does not execute slide scripts, animations or external content.

## PPTX import and export

**Open PPTX / JSON** opens a `.pptx` presentation or a presentiX JSON backup. Successful imports replace the deck as one undoable operation; invalid imports leave the current deck intact. **Export PPTX** downloads a standard OOXML presentation with slide order, editable text boxes, basic shapes, embedded raster images, backgrounds and speaker notes. Export runs locally in the browser and includes the required package relationships, master, blank layout and theme.

Import follows the presentation's slide relationships and ordering. It reads text and paragraph breaks, basic rectangle/ellipse geometry, positions, sizes, rotation, solid RGB/theme colors, basic font properties, embedded PNG/JPEG/GIF/WebP images and notes. Simple groups are flattened into editable objects. Standard slide dimensions are normalized to a 960-pixel-wide canvas. No external images or linked content are fetched.

PPTX interchange is **not lossless** for arbitrary PowerPoint decks. The import report lists simplifications. Mixed run formatting, fonts, bullets, borders, crop settings, master/layout artwork, effects and rotated groups can change; complex shapes become rectangles. Charts, tables, connectors, audio/video, embedded objects, vector images, animations and transitions are unsupported or skipped. Unsupported content is not retained in the exported deck. Use a copy of the original PPTX and review imported slides before presenting. Fonts are not embedded; image/format support also varies between PowerPoint versions.

Limits: 100 slides, 200 elements per slide, 2,000 elements per deck; text up to 10,000 characters per element and notes up to 20,000 per slide. Raster images are limited to 3 MB each and approximately 12 MB total. Deck JSON is limited to 20 MB. PPTX import accepts files up to 25 MB, 4,000 package entries and 50 MB declared expanded size. Macros and external resources are never executed.

## AI chat

Click **AI chat** or **Create with AI**. Ask for a new deck, a pitch outline turned into slides, concise wording, better hierarchy, a coherent palette, or speaker notes. Questions can be answered without edits. Creating/editing a deck returns a complete proposed presentation for review.

The assistant receives the complete deck, element coordinates and styles, speaker notes, active slide and selected object, document schema, response schema and any attached reference text files. Embedded images are included in the JSON as data URLs, not as a provider-specific vision input. Review what you share. The shared 600,000-character request limit can exclude image-heavy decks; use a smaller deck or turn off document context for general questions.

Configure only the relay URL in this editor's **Relay** settings. Configure providers and API keys on the relay's `/relay` page. Read [shared AI chat](../shared-ai/README.md) for provider setup, attachments, request/schema downloads, errors and cancellation. A live provider requires working credentials and network access.

Read the response and click **Review proposed edit → Apply reviewed edit**. Responses must match the request and unchanged deck snapshot and pass document validation. Nothing applies automatically. Both the native Undo and **Undo AI edit** can restore an applied proposal; the latter refuses to overwrite subsequent edits. AI changes are blocked while importing, exporting or dragging an object. AI replies do not execute commands or independently verify factual claims.

## Verification

```sh
node presentiX/project-test.cjs
python3 presentiX/pptx-fixture.py create /tmp/presentix-fixture.pptx
node presentiX/browser-test.cjs
```

The browser test needs the suite server on port 8000, Playwright, `/usr/bin/chromium` and Python's `python-pptx` package (development verification only). It covers editing/dragging, history, images, ordering, presentation navigation, persistence, real PPTX round trips, notes, independent import fixtures, independent reading of exports, atomic invalid import rejection, and mocked AI review/apply/Undo. It does not establish pixel-perfect PowerPoint rendering or live provider availability.

SVG images from graphiX or other editors can be inserted from local disk or the shared virtual disk. They are converted to embedded PNG images (up to 2048 pixels per side) to preserve their appearance in JSON backups and PowerPoint exports. SVG scripts and external resources are disabled during conversion.
