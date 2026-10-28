# colabriX · Collaborative whiteboard

A Miro-inspired whiteboard in the TLAL OS suite, using the shared typography, colors, icon family, storage controls, AI chat and coding-agent integration. It supports brainstorming, connected diagrams and facilitated workshops. It does not claim full Miro feature or file-format compatibility.

![colabriX whiteboard](../assets/screenshots/colabriX.png)

## Start a board

Run the repository server as described in the [root guide](../README.md), then open `/colabriX/` or choose colabriX on the desktop. A brainstorm template opens on first use. The board is saved locally in IndexedDB; reload restores your last draft. A failed browser save is reported in the header. Export a backup before replacing a board or clearing browser data.

- Add sticky notes, text, rectangles, ellipses, diamonds, frames, images or freehand strokes. Double-click an item to focus its text editor. SVG image imports are sanitized and rasterized; PNG/JPEG/WebP images are resized to a maximum 1024-pixel edge and embedded as WebP.
- Drag items to move them. Shift-click or drag a selection rectangle to select several. Drag a selection handle to resize, or enter exact dimensions and rotation in Properties. Rotated items use Properties for resizing.
- Group/ungroup, duplicate, align left, distribute horizontally, change colors and bring items to the front/back. Locked items stay unchanged by normal editing operations. Frames render behind other objects. Assign a frame in Properties; dragging the frame carries its assigned children. Frames cannot be nested.
- Select **Connect**, then click the source and target. Select a connector to edit its label, routing (straight/elbow/curve), color or line style.
- Use Hand to pan, the wheel to zoom around the pointer, Shift-wheel to pan horizontally, and Fit board to see everything. Present frames opens a frame-by-frame view.
- Add comments to a selected item, resolve/reopen them, start a voting round with a per-browser budget, or start/pause the shared workshop timer. Names and votes are self-reported; they are not verified identities or a secure ballot.

Shortcuts: **V** select, **H** hand, **N** sticky note, **C** connector, **P** freehand, **Ctrl/Cmd+A** select all, **Ctrl/Cmd+D** duplicate, **Ctrl/Cmd+G** group, **Ctrl/Cmd+Shift+G** ungroup, **Ctrl/Cmd+Z** undo, **Ctrl/Cmd+Shift+Z** redo, **Delete** remove, and arrow keys to nudge (Shift for ten pixels). Shortcuts do not intercept text fields or dialogs.

## Local boards

Boards are saved locally in the browser. Exchange JSON or native project ZIP files for manual sharing. Existing local board drafts and collaboration recovery JSON remain importable; choose **Work together** for master-led collaboration over magic-wormhole.

## AI chat and coding agent

Use the same **AI chat** window as the other tools. Providers are configured on the relay; colabriX knows only its relay URL. The current native board, selection, schema and multi-turn conversation are included with requests. Attach reference files or images using the shared chat controls.

Example: **“Cluster these ideas into three themes, add a frame for next steps, and connect the key decisions. Preserve the original notes and comments.”** Review the proposed board, then apply it. Questions and options can be discussed without editing. The separate coding-agent tab, skill catalog, paging, attachments and workflow tools are available through the suite integration. AI never changes Google sharing permissions.

Download the board schema from the left panel, or the complete agent API/schema from AI chat. [model.js](model.js) defines the canonical validation and schema; [ai-adapter.js](ai-adapter.js) describes proposal behavior. Schema validation rejects executable markup and external image URLs. Editing review uses the current native board rather than shared presence metadata, so presence updates do not invalidate proposals.

## Import, export and storage


Use **Project ZIP** for a portable, reviewed native project import/export with embedded images. Project ZIP excludes Drive bindings, credentials, presence and collaboration history. Shared Workspace offers recovery points, content inventory, reviewable note-grid arrangement and resolved-comment cleanup. The app is also included in the optional suite-wide Tauri staging build.

## Validation

```bash
node colabriX/model-test.cjs
BASE_URL=http://127.0.0.1:8000 node colabriX/browser-test.cjs
```

## Work together between PCs

The default collaboration transport is magic-wormhole. The master shares a single-use code; a participant joins after confirming replacement of its local board. Changes use durable in/out queues and master-numbered snapshots. See [installation, roles, queue behavior and limits](../shared-suite/WORMHOLE.md). Local editing and project ZIP sharing do not require pairing.
