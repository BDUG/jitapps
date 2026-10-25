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

## Collaborate using a shared Google Drive document

1. Set up the suite's [Google connection](../shared-suite/GOOGLE-DRIVE.md). Enable **Google Drive API and Google Docs API** in the same Google Cloud project and register the server's exact JavaScript origin. The public OAuth client ID identifies your installation; no API key or client secret is required for this flow. Google may require consent verification or organization approval.
2. Open **Collaborate → Create shared document from this board** and approve Google's confirmation popup. The app creates a native Google document containing its shared board data. The document belongs to the signed-in Google account.
3. Choose **Open Google document**, then use Google's **Share** button to give collaborators edit access. Copy the **Share this app link** to them separately. The app never emails invitations or changes Google permissions itself.
4. Each collaborator opens that app link, connects Google and chooses **Join shared board**. Reading existing documents needs **All Drive files** consent, or an individual Picker grant in file-scoped mode, in addition to Google's document permissions. Choose these options in Google connection settings. Join asks before replacing the local board.
5. Participants edit through colabriX. Updates normally arrive within about four seconds; writes are debounced and presence updates less frequent. **Sync now** retries immediately. Names shown in the toolbar indicate recently active app sessions, not authenticated identities.

The Google document is a JSON data container. Do not edit its JSON or add extra tabs, tables, images or other content in Google Docs. Use Google's document window for sharing permissions. Missing permissions, an expired token, disabled APIs, incompatible content or document size limits appear in the collaboration status; local work is retained. Reconnect using **Sync now**. Closing Google consent leaves the current board unchanged.

### Concurrent edits and recovery

The shared format in [collaboration.js](collaboration.js) uses Lamport-stamped registers for individual object fields and explicit deletion tombstones. Different fields merge independently. The board title, background, timer and voting settings each form a register. Equal-field conflicts converge deterministically and offer **Keep mine / Use theirs** in the collaboration window when both changes can be identified against the last synchronized version. The last synchronized base and unresolved choices are saved locally so conflicts can still be identified after reconnecting. Deterministic merging remains the fallback when no common base is available, for example when starting from a standalone recovery import.

Google Docs writes use `writeControl.requiredRevisionId`. If another writer changes the document, colabriX rereads and merges before retrying, up to three attempts per sync. Failed sync retains local edits and backs off polling up to 64 seconds. Undo/redo uses your session's operations and skips fields subsequently changed by other editors. The undo history itself is session-local and resets on reload. Native reviewed imports and AI proposals use the same merge-aware change path; stale AI proposals must be refreshed.

Local backups contain the collaboration registers and shared document ID, but no OAuth token. **Download collaboration recovery JSON** preserves the full local registers for recovery; Open can import it as a standalone board. Export recovery before reconnecting if you need to inspect conflicting local values. **Keep local copy & disconnect** stops future synchronization; an already submitted remote write may still finish. Replacing a board/template explicitly disconnects and leaves the old Google document intact.

Shared documents are limited to **900,000 UTF-16 characters**, including embedded images and tombstones. Oversized writes are rejected without truncation. Native boards support up to 2,000 items, 10,000 connections/comments/votes per collection, and 10,000 points per freehand stroke. Large images and long-running boards may need a fresh shared document made from a clean native JSON import to discard historical registers. This polling-based prototype does not provide WebSocket realtime cursors, Google identity verification, access roles inside the app, or offline cross-device authentication.

## AI chat and coding agent

Use the same **AI chat** window as the other tools. Providers are configured on the relay; colabriX knows only its relay URL. The current native board, selection, schema and multi-turn conversation are included with requests. Attach reference files or images using the shared chat controls.

Example: **“Cluster these ideas into three themes, add a frame for next steps, and connect the key decisions. Preserve the original notes and comments.”** Review the proposed board, then apply it. Questions and options can be discussed without editing. The separate coding-agent tab, skill catalog, paging, attachments and workflow tools are available through the suite integration. AI never changes Google sharing permissions.

Download the board schema from the left panel, or the complete agent API/schema from AI chat. [model.js](model.js) defines the canonical validation and schema; [ai-adapter.js](ai-adapter.js) describes proposal behavior. Schema validation rejects executable markup and external image URLs. Editing review uses the current native board rather than shared presence metadata, so presence updates do not invalidate proposals.

## Import, export and storage

**Open** accepts native board JSON or a collaboration recovery JSON file from local disk, virtual disk or Google Drive. Image loading uses the same storage source chooser. **Export** offers editable JSON, SVG, PNG, Markdown and CSV; choose the destination inside the export menu. PNG export is rasterized and capped at a 4096-pixel edge; SVG/JSON retain editable geometry. CSV exports notes, metadata, frame IDs and vote totals; Markdown includes notes and comments. Neither is a round-trip project format.

Use **Project ZIP** for a portable, reviewed native project import/export with embedded images. Project ZIP excludes Drive bindings, credentials, presence and collaboration history. Shared Workspace offers recovery points, content inventory, reviewable note-grid arrangement and resolved-comment cleanup. The app is also included in the optional suite-wide Tauri staging build.

## Validation

```bash
node colabriX/model-test.cjs
BASE_URL=http://127.0.0.1:8000 node colabriX/browser-test.cjs
```

Tests cover field merging, deletion, conflict choices, collaborator-safe undo, concurrent revision retries, offline retention, in-flight edits, editing tools, exports, ZIP, AI review, persistence and two browser sessions sharing a mocked Google document. Google consent and API calls are mocked; live Google accounts and paid AI providers are not exercised.
