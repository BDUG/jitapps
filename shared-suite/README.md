# Shared desktop and virtual disk

The suite desktop lives at `/` and lists all 13 applications. Each card opens an app; the small **Desktop** button in every app returns here. SVG icons are shared by the desktop cards, app headers and browser tabs.

## Save and open files

Use any normal Open, Import, Insert image or Attach files control to choose **Local disk** or **Virtual disk**. This includes dynamically created controls such as component icons and chat attachments. Folder readers preserve relative paths from either source. Canceling the source chooser leaves the content unchanged. Local workspace linking in codeiX still uses a real filesystem directory so write-back works.

1. In any app, choose **Exports: virtual disk** in the bottom-left suite controls.
2. Use that app's normal export or backup button and choose its format as usual.
3. In the save dialog, choose a folder and file name, then **Save to virtual disk**. A replacement requires confirmation. Canceling leaves the disk unchanged.
4. Open another app and click **Virtual disk**. Choose the appropriate **Import into** reader, select a compatible file, and click **Import selected**. The app's existing validation, size limits, import warnings and Undo behavior still apply.
5. Switch to **Exports: computer** to download normally. This setting is remembered separately for each app.

For complete editable backups, use each app's JSON/project/research backup format. Visual exports preserve only the information that format supports. Saving a file to the disk does not make it compatible with every app: for example, SVG can move from sketchiX to graphiX, PPTX between sketchiX and presentiX, and XLSX can move into sheetiX. App-specific JSON formats remain app-specific.

Architex has separate metamodel and instance import scopes, plus validation-rule and Sphinx RST readers. Select the intended model scope before importing. Its native compatibility checks still apply. Source files and folder trees can be imported by codeiX. The text, diagram and presentation editors also offer their image insertion readers.

## Manage the disk

- **New folder** creates folders or nested relative paths. Use folder names or the location field to navigate, and **Up** to return to a parent.
- **Upload files** copies files from your computer into the current folder. **Upload folder** preserves the entire selected directory tree.
- Folder readers such as codeiX and Architex's Sphinx RST importer offer **Import this folder**, including nested files with relative paths.
- **Download selected** downloads a single file directly; multiple files or folders are packaged as a ZIP with their paths preserved.
- **Delete selected** asks before deleting files or entire folder trees. Disk deletions have no Undo; download a backup first when needed.

## Storage behavior

The virtual disk is **IndexedDB storage in this browser profile**, shared by apps served from the **same origin** (protocol, host and port). Use the same server address for every app. Another port, `localhost` versus an IP address, another browser/profile, or another computer has a separate disk. It does not sync to the relay, server filesystem or a cloud service, and does not require AI configuration.

Files persist across reloads and tabs, including binary data such as XLSX, PPTX, PNG and ZIP. Clearing this site's browser data deletes the disk. Private browsing and browser quota/eviction policies can limit persistence. Keep downloaded backups of important work. Individual files are limited to **50 MiB**; each app may impose a smaller import limit. Storage failures are shown in the disk dialog. Concurrent file creations and stale overwrites are rejected rather than silently replacing newer data.

Serving through `python3 server/server.py` or another static web server is recommended. Direct `file://` opening does not reliably provide shared browser storage.

## Integration

`apps.js` is the common app registry and declares native file-input readers. `disk.js` exposes `SuiteDisk` (`write`, `get`, `all`, `list`, `mkdir`, `remove`, `asFile`) and stores Blobs without text conversion. `ui.js` provides navigation, disk management and import delivery to registered and dynamically discovered file-input readers. App download helpers call `SuiteDiskUI.download(anchor)` with an object-URL anchor; the computer destination keeps the existing download behavior, while the disk destination opens a save dialog. No browser globals or native download/file-picker prototypes are replaced.

To add an app, register its identity and input IDs, add an SVG icon, load the shared stylesheet/scripts in its entry point, and route its download helper through `SuiteDiskUI.download`. Provider configuration exports deliberately stay in the relay's own UI and are not copied automatically to this disk.

Run `node shared-suite/browser-test.cjs` with the suite on port 8000. It tests desktop cards/icons, all 13 apps' native imports and disk exports, binary preservation, cross-app SVG transfer, nested source imports, path validation and concurrent-write protection.

## Workflow file access

`automatextiX` can list, read and write this disk with native workflow steps. Paths and contents accept incoming-item templates, enabling file → AI/command/web → file pipelines. These are browser disk operations, independent of the optional OS command runner. File replacement is disabled by default; revision-checked write-back is available. See the [workflow file guide](../automatextiX/README.md#use-files-from-the-shared-workspace) for encodings, the 300 KB workflow file limit and completed-write behavior. `SuiteDisk.write` also accepts an optional `AbortSignal` to abort an uncommitted write.

vidiX accepts project JSON bundles and video/GIF/SVG/image media through separate import targets. Its GIF, animated SVG, PNG and browser-supported video exports can also be saved to this disk; other apps must support the exported format to consume it.

## Workspace productivity tools

Every editor now has **Workspace** and the Ctrl/Cmd+K palette, with reviewed find/replace, named recovery points, portable backups, app-specific AI workflows, document insights, inspection reports and agent handoff ZIPs. See the [complete workspace guide](WORKSPACE.md). Recovery storage is separate from the shared virtual disk; portable backups and handoffs can be exported to either disk.
