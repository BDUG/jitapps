# Google Drive storage

All sixteen apps can load and save content through Google Drive. Choose **Google Drive** in a normal Open/Import/Insert/Attach source chooser or as the **Destination** in an export/Project ZIP dialog. The virtual-disk window also offers a Google Drive browser.

The main connection uses **Google's sign-in and confirmation window**. No API key, client secret, or manually copied access token is required. Google does require a registered OAuth client ID identifying this app; the consent window cannot replace that registration.

## Configure the installation once

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable **Google Drive API**.
2. Configure Google Auth Platform's consent screen/audience. For an External app in Testing, add your Google account as a test user. Select the required scopes: `https://www.googleapis.com/auth/drive.file` for files created by/shared with the suite, and optionally `https://www.googleapis.com/auth/drive` for full Drive browsing and editing.
3. Create an **OAuth 2.0 Client ID → Web application**. Add the exact **Authorized JavaScript origin**, such as `http://localhost:8000`, or your HTTPS deployment origin. Origins have no path; different hosts/ports need their own entries. This browser token flow does not require a redirect URI or client secret.
4. Set the public client ID in [`google-drive-config.json`](google-drive-config.json):

   ```json
   {"clientId":"YOUR_CLIENT_ID.apps.googleusercontent.com"}
   ```

5. Serve the suite normally. A user opens Google Drive and clicks **Connect with Google**, chooses an account, and approves Google's confirmation window. The built-in Drive browser makes authenticated requests using that short-lived OAuth token, without an API key.

The installation-wide file is public and must contain **only the public OAuth client ID**, never secrets or credentials. It is included in the staged desktop assets. Existing browser-specific client settings take precedence. Changes to the public file are read when a page without a saved client ID opens Drive.

Alternatively, open **Google connection setup · no API key** inside the Drive dialog, enter your own client ID, and save. This stores a per-browser/origin override; it is useful for development or a different Google Cloud project. End users of a preconfigured installation do not need to paste a client ID.

Direct `file://` pages and arbitrary embedded/custom Tauri origins are not supported for Google sign-in. Use the normal browser deployment on an authorized HTTP localhost or HTTPS origin; Google's secure-browser policy can reject embedded authentication.

## Choose the access Google should confirm

| Access | Scope and behavior |
| --- | --- |
| **Files created by or shared with this suite** | Default, including migrated configurations. Requests `drive.file`. Create folders/files, reopen app-created files, and access individual files already authorized to this app. It does not list the whole Drive. No API key is needed for these operations. |
| **All Drive files · read and write** | Requests Google's full `drive` scope after you explicitly select it, save settings, and approve it through Google. The built-in browser can load existing accessible files/folders, traverse subfolders and save/replace files without Google Picker or an API key. |

Full Drive scope also grants deletion permission at Google, although this UI has **no remote-delete action**. Google or your organization may require verification or administrator approval for this broader scope. For personal testing, configure your own OAuth project/test users. App code cannot bypass Google's consent, verification or organizational restrictions.

To change access, open setup, select the access level, save, and reconnect. The requested scope is checked in the token response; denied consent does not grant broader access. Saving settings invalidates the page's old connection and any pending sign-in callback. Tokens remain only in memory on the current page; pages/tabs connect separately and reloads/expiry require a new connection. Disconnect clears the page's token and asks Google to revoke it.

## Load and browse without an API key

1. Use the app's normal Open/Import/Insert/Attach control and choose **Google Drive**.
2. Click **Connect with Google** and approve the requested access. If you need existing files that are not listed in file-scoped mode, select **All Drive files** in setup, save, and reconnect.
3. Navigate folders in the built-in browser, use **Up**, and use **Load more** for additional pages. **Open Drive link / ID** opens an accessible Google Drive/Docs file or folder by its usual link or ID, without a Picker API key. A link does not itself grant access.
4. Select a compatible file and click **Load selected**. A folder importer offers **Load this folder**, including recursively accessible files and relative paths. The app's normal validation, size limits, review, model-scope selection and Undo behavior remain in force.

My Drive is the default root. Shared folders/drives may require opening their link/ID and appropriate Google permissions. Unsupported URLs, file IDs, and unsafe or duplicate folder paths are rejected.

In file-scoped mode, selecting a folder does not automatically authorize every existing descendant. Switch to the broader consent option when appropriate, grant specific files through optional Picker, or download a folder ZIP through Google's own UI and use a compatible app's normal ZIP importer.

Native Google Workspace files are converted by Google's export API:

| Google file | Imported format |
| --- | --- |
| Docs | DOCX |
| Sheets | XLSX |
| Slides | PPTx |
| Drawings | SVG |

Regular files retain their binary contents. Choose an importer supporting the converted format. Other Workspace types and shortcuts are not automatically resolved. Google-specific features can be simplified, and Google's export limits apply; this is not lossless collaborative Google Docs editing.

## Save and replace

1. Choose **Destination: Google Drive** in normal export controls or Project ZIP.
2. Export in the app's usual format. The Drive dialog retains the prepared export while you connect.
3. Browse a destination folder, open a folder link/ID, or create a **New folder**.
4. Enter a name and click **Save to Google Drive**. The default creates a new file, even when another file has that name.
5. To replace an existing regular file, select exactly one file, choose **Replace the selected file**, and confirm. To replace a native Google Docs, Sheets or Slides file, select the matching Google format and confirm replacement. Native replacement requires a current version and conditional update token; otherwise save a new file.

The selected file's version is checked again before replacement. When Google exposes an ETag to browser JavaScript, the update includes `If-Match`; without an exposed ETag, the version preflight cannot eliminate a simultaneous-edit race during upload. Avoid concurrent replacements and refresh before retrying. There is no remote Undo or background synchronization.

Canceling before Save writes nothing. **Cancel transfer** aborts the browser request, but Google may already have accepted a write; refresh before retrying to avoid duplicate files. Closing the dialog preserves app content. **Copy selected to virtual disk** stores accessible cloud files in the browser's virtual-disk root after normal overwrite confirmation.

## Optional Google Picker

Google Picker is an **alternative** Google-hosted chooser, mainly useful for granting individual existing files while using narrow `drive.file` access. It still requires its own API key and project number; a consent popup does not remove Google's Picker-specific requirement.

If desired, enable **Google Picker API** in the same Cloud project, create an API key restricted to Picker API and your website referrers, and find the numeric Google Cloud project number. Enter these under **Optional: Google Picker** and save settings. Its chooser button appears only when both fields are configured. You do not need these fields or this API for the built-in OAuth/Drive browser.

## Configuration, privacy and troubleshooting

- Installation default: `shared-suite/google-drive-config.json`, public client ID only.
- Browser override: localStorage key `suite-google-drive-config-v1`, containing public client/access settings and optional Picker identifiers. No client secret or provider key belongs here.
- Tokens: current-page memory only; never stored in projects, relay settings, or the virtual disk, and never sent to the suite server.
- **Origin mismatch/access blocked:** check the Web OAuth client's exact authorized origins, consent-screen test users, enabled Drive API, verification and organization policy.
- **Popup/scripts blocked:** allow Google sign-in popups and the Google Identity Services/Drive API domains. Google SDKs load only when Drive is opened; Picker's SDK loads only when that optional chooser is used.
- **Expired sign-in:** connect again. Uploads are not silently replayed after a 401 or network failure.
- **Missing existing files:** check the displayed access mode and permissions, use broader Google-confirmed access when appropriate, or open an accessible file/folder link. File-scoped access is intentionally incomplete.
- **Quota/permission/network errors:** the dialog reports the failure while leaving app content available locally. Browsers can impose storage/memory limits, and app import limits still apply.

The integration performs explicit file transfers with Google Drive API v3, not automatic sync, a service-account connector, or remote collaborative editing. Scripts/extensions on the same origin share the browser's trust boundary. Provider/AI configuration is separate.

## Verification

```sh
node shared-suite/google-drive-test.cjs
BASE_URL=http://127.0.0.1:8000 node shared-suite/google-drive-browser-test.cjs
```

Tests use mocked Google authorization/Drive/Picker endpoints. They exercise API-key-free consent, scopes, existing-file loading by link, binary project ZIP creation/replacement, token expiry, all sixteen app integrations, optional Picker, and an installation-wide client ID requiring no user configuration. Live Google consent still requires your registered project and account.

## Shared whiteboards in colabriX

[colabriX](../colabriX/README.md) adds multi-party whiteboard editing using a native Google document as a JSON data container. Enable **Google Docs API** alongside Google Drive API in the OAuth client's project. The browser uses the same memory-only consent token. Its bounded Docs adapter reads documents and writes with `writeControl.requiredRevisionId`; it does not expose access tokens to apps or send them to the suite server.

Create a board in **Collaborate**, manage editor permissions through Google's own Share window, and copy the app link to collaborators. Existing-document access requires full Drive consent or an individual file-scoped grant plus actual Google sharing permission. Boards poll every four seconds, merge object fields and retain local edits when writes fail. See the app guide for conflict handling, recovery and the 900,000-character shared-document limit. The normal Drive file Save/Replace operation is separate from this revision-checked collaboration protocol.

## Google account sign-in

The desktop and Drive dialog now offer **Google account**, with the official GIS sign-in button and optional One Tap. Account sign-in and Drive file authorization are separate. Sign-in does not grant Drive scopes; signing out of the app does not revoke a Drive connection. Both flows share the public OAuth client ID. See [Google sign-in configuration](../docs/GOOGLE-SIGN-IN.md), including the optional official server verifier dependency.

### Direct file and project actions

- In any app, use its usual load/import button and choose **Google Drive**. Select a file compatible with that importer, or use a folder importer to load a complete directory structure.
- In **Project ZIP**, use **Load project from Google Drive** or **Save project to Google Drive**. These shortcuts do not change your usual export destination. Imported projects are validated and reviewed before replacement.
- For other export formats, choose **Google Drive** as the export destination, then export normally.
- On the shared **Virtual disk**, select files or folders and choose **Save selected to Google Drive**. A single file retains its format; multiple files and folders are packaged in a ZIP preserving paths. Use **Google Drive → Copy selected to virtual disk** for the reverse direction.

The Drive browser lets you choose a destination folder and create a new file, or explicitly select and confirm replacement of an existing file. Closing the browser before saving cancels the pending save. Connect and approve Google access first; no files are uploaded merely by opening these dialogs.


### Google Docs, Sheets and Slides

| App | Open from Drive | Save native Google file |
| --- | --- | --- |
| textiX | **Open Google Docs** | Export format **Google Docs · Drive**, then **Export** |
| sheetiX | **Open Google Sheets** | Export format **Google Sheets · Drive**, then **Export** |
| presentiX | **Open Google Slides** | **Save Google Slides** |

Choose the document in the Drive browser, or paste its Google Docs/Sheets/Slides link with **Open Drive link / ID**. Google exports the native document as DOCX, XLSX or PPTX for the app importer. When saving, the app generates that office format and the Drive upload API converts it to the matching native Google format. You can also select that format in the Drive save dialog when exporting an office file. Project ZIP exports remain project ZIPs.

Native Google files live on Drive; local and virtual-disk copies use the corresponding office formats. This is import/export, with explicit saves, rather than live Google collaborative editing. Google conversion and each editor's importer/exporter can simplify layout, formulas, animations and Google-specific features; check import warnings and keep originals for complex documents. Existing app size, sheet and slide limits still apply. Drive API and the existing Google authorization are required; these conversions do not require separate Docs/Sheets/Slides API clients.

Browser round-trip checks with mocked Google APIs: `BASE_URL=http://127.0.0.1:8031 node shared-suite/google-workspace-browser-test.cjs`.
