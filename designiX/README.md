# designiX · Graphic design studio

A local-first graphic design app for posters, social graphics, stories, banners, invitations, presentation artwork and brand layouts. Open [`/designiX/`](./) from the suite desktop. It uses the suite's Inter typography, maroon/orange/blue interface colors, accessible focus states and shared navigation. Artwork keeps its own colors.

![designiX graphic design workspace](../assets/screenshots/designiX.png)

## Create and edit

- **Eight editable templates:** studio launch, event poster, story, presentation, personal identity, seasonal collection, invitation and banner. Search by name or category. Applying a template asks before replacing the current document; Undo restores it.
- **Custom multi-page canvases:** social, story, A3 poster, landscape, business-card artwork, presentation, banner or custom dimensions. Add, duplicate, delete and reorder pages. Resizing changes canvas dimensions while preserving element sizes and positions.
- **Typography:** headings/body text, six system-font families, weight, italic, alignment, tracking, line spacing, fill and stroke. Text wraps approximately by character width and clips to its frame; check long text and increase frame height as needed. Double-click a text layer to focus its text editor.
- **Shapes:** rectangles, ellipses, triangles, stars, hearts, diamonds, arrows and lines. Edit position, dimensions, rotation, colors, opacity, borders, corners, shadow and blur.
- **Images:** load PNG, JPEG, WebP or SVG from local disk or virtual disk. SVG is sanitized and rasterized on import. Place media repeatedly, replace an image without losing its frame, choose cover/crop or contain, adjust crop position, brightness, saturation, corners and opacity. Remove unused assets when packaging a project.
- **Layers:** change stacking order, visibility and locks. Shift-click for multiple selection, group/ungroup related objects, duplicate, copy/paste inside the editor, align, distribute and nudge. Canvas dragging skips locked elements; explicit property editing remains possible.
- **Mouse controls:** drag elements to move, drag the corner handle to resize, and drag the circular handle to rotate. Drag empty canvas space for a selection rectangle. Snap uses an eight-pixel grid and page-center attraction. Hand mode pans, Fit frames the page, and Ctrl/Command-wheel zooms. The optional grid is an editor overlay and is not exported.
- **Brand kit:** reusable colors and heading/body font choices. Apply brand colors to selected layers, apply brand styling to a page, and import/export brand-kit JSON. Brand choices travel with a complete project.
- **Preview:** browse all pages without editor handles. Undo/Redo keeps up to 40 local editing states; browser reloads retain the current document, not that transient Undo stack. Shared Workspace recovery offers named persistent recovery points.

Keyboard shortcuts outside text fields: Ctrl/Command+Z undo, Ctrl/Command+Shift+Z or +Y redo, +D duplicate, +C/+V internal layer copy/paste, +A select unlocked visible layers, +G group, +Shift+G ungroup. Delete/Backspace removes unlocked selections. Arrow keys move by one pixel; Shift+Arrow moves by ten. Escape cancels a gesture and clears selection.

## AI design assistant

Open **AI chat** and configure the normal suite relay if needed. Chat receives the native project schema, complete pages, embedded assets, brand kit and selected layers. It can answer questions, ask follow-up questions with options, create compositions, refine typography or propose campaign pages. Review a proposal before applying it; stale proposals are rejected by the shared chat integration. **Undo AI edit** restores the previous design.

Example:

> Create a coordinated two-page launch campaign for a sustainable coffee brand. Use a warm cream background, deep green headings and orange accents. Add a clear headline, a short call to action and editable native shapes. Keep all existing pages and assets.

Use the clickable **Create a design**, **Create a campaign**, and **Polish selected layers** prompt fragments. The downloadable design schema helps other coding agents generate valid projects. New illustrations use native shapes/text; text chat does not fabricate photos, fetch stock assets or call an image-generation provider. Upload images and ask the assistant to reuse their asset IDs.

The shared **Coding agent** tab, skill selection, conversation attachments, new-conversation control, context paging, response repair and proposal review are available as in the other apps. Coding-agent commands use the machine running your suite server and require its normal configuration; they are separate from design chat.

## Save, load and share

| Format | Contents |
| --- | --- |
| Native JSON | Complete editable project, all pages, embedded images and brand kit. |
| Project ZIP | Portable native project; shared import review, recovery point and strict same-app validation. |
| SVG | Current page as static artwork; embedded images, text, shapes, filters and clipping. Text remains text, with font availability affecting appearance. |
| PNG / WebP | Current page; optional transparent background and raster scale. |
| JPEG | Current page, flattened against its background/white. |
| PDF | All pages as raster artwork, at the chosen scale. Page size uses 96 canvas pixels per inch; no editable PDF text or CMYK/prepress guarantee. |
| All-pages ZIP | Every page as PNG and SVG. This visual archive is distinct from a native Project ZIP. |
| Brand-kit JSON | Palette and font pairing only. |

Choose **Destination** in the export dialog or Project ZIP menu: Computer or Virtual disk. Normal Open, Insert image and brand-kit readers use the shared local/virtual source chooser. Settings, secrets, chat history and separate disk files are excluded from native project packages.

The current project is autosaved under `designix-project-v1` in this browser's localStorage. A quota error advises exporting; local browser storage is not a substitute for backups. Native projects support 1–100 pages, up to 3000 elements and 500 embedded assets. Canvas dimensions are 32–8000 pixels per side. Images must be at most 20 MiB before import, 40 megapixels and 16000 pixels per side; normalized image data must fit the native asset limit. Raster exports are bounded to 40 megapixels/16000 pixels per side. Project JSON and Project ZIP imports support 50 MiB; browser memory and export encoding impose practical limits too.

This is a hobby editor, not Canva feature parity. There is no online stock marketplace, real-time collaboration, publishing/social scheduler, editable PDF/Canva import, arbitrary vector-path pen tool, or production prepress pipeline. Grouping is flat within each page. System fonts can differ across machines. Keep a native project for future editing.

## Verify

```sh
node designiX/model-test.cjs
BASE_URL=http://127.0.0.1:8000 node designiX/browser-test.cjs
```

Tests exercise the real editor and exports, native ZIP review, embedded media, schema-driven AI proposals with a mocked relay, persistence and mobile layout. No live AI model call is required or claimed.
