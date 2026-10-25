# Portable project ZIP

Every app provides **Project ZIP** in its header and **Workspace → Recovery → Import / export project ZIP**. This also covers sketchiX’s sketch and shape editors. The package preserves the app’s complete native document rather than an AI summary or flattened visual export.

## Save and restore

1. Open Project ZIP and choose **Computer** or **Virtual disk**.
2. Click **Export project ZIP**. For virtual disk, choose a folder/name and complete **Save to virtual disk**.
3. To restore, choose **Import project ZIP**, then **Local disk** or **Virtual disk**. On the virtual disk, choose this reader and select the ZIP.
4. Review the proposed document changes in Workspace. The live project stays unchanged until **Apply reviewed changes**.
5. Applying saves the previous document in Recovery. Changed or busy documents require a fresh import/preview. Failed validation leaves the current document intact.

The archive belongs to one exact editor: a shape-editor project is distinct from a main sketchiX diagram. Cross-app packages are rejected. Import uses the current app mode and its native validation; for example, switch Architex out of Direct diagram mode before restoring a typed instance model. New imported validation scripts retain the existing activation safeguards. appiX previews and automation workflows are not executed by import; codeiX does not write imported source to a linked OS workspace automatically.

## Included data

The native document carries models, rules, source-file trees, slides, cells/formulas, topic data, image operations, embedded images/media, research libraries and other supported project fields. The source media in a photiX project can differ from the currently open image. vidiX packages include its embedded asset list.

Provider configuration and API keys stored by the relay, chat history, editing-preset/workflow libraries, unrelated virtual-disk files, server workspace directories and app preferences are separate. They are not collected into the ZIP. Values explicitly stored within the native document remain document data. External file/URL references remain references; export does not crawl or fetch them. Use each app’s native exchange formats when a recipient needs DOCX, SVG, XLSX, PPTX or similar files.

Existing source ZIP, Tauri project ZIP and agent-handoff ZIP exports have different purposes. This importer accepts the versioned project package below, not arbitrary ZIP folders or third-party project formats.

## Package contract

```text
manifest.json
workspace.json
README.md          # optional on import
```

Example manifest:

```json
{
  "format": "tlal-project-zip",
  "version": 1,
  "tool": "textiX",
  "document": "workspace.json",
  "workspaceCRC32": "12345678"
}
```

`workspace.json` contains an `agentic-suite-workspace` version 1 envelope with the same `tool`, a creation timestamp and the complete `document` object. The checksum is the lowercase eight-digit CRC32 of the exact UTF-8 workspace.json bytes. The example checksum above is illustrative. CRC32 detects accidental corruption; it is not a signature or proof of authorship. Native validation remains authoritative.

Both compressed archives and expanded workspace documents are limited to **50 MiB**, with a 64 KiB manifest limit and each app’s own native limits. Virtual disk and recovery storage retain their existing size/quota limits. Imports preflight single-disk ZIP metadata and member count before loading entries, reject extra members and normalized/traversal paths, stream the needed members with byte bounds, and verify their CRCs and the manifest checksum. ZIP64/multi-volume archives are not needed for this small package format. No member is extracted to the OS filesystem or executed.

## Verification

```sh
node shared-suite/project-zip-test.cjs
BASE_URL=http://127.0.0.1:8000 node shared-suite/project-zip-browser-test.cjs
BASE_URL=http://127.0.0.1:8000 node shared-suite/project-zip-guards-browser-test.cjs
```

Unit checks cover round trips, unchanged inputs, wrong-editor archives, malformed/corrupt content, traversal/extra members and declared expansion limits. Browser checks cover all 16 editor pages with real downloads, reviewed restores, recovery, corrupt-file isolation, virtual-disk save/load and mobile dialog width. They also exercise a different photiX source image and an embedded vidiX asset. Live AI calls are not needed.
