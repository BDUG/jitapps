# Optional TLAL OS desktop application (Tauri 2)

This wraps the **complete desktop and all 18 apps** in a native Tauri 2 window. The existing browser deployment remains available. It is separate from codeiX’s export of an individual project to Tauri.

The installer includes public SPA assets and a frozen Python server sidecar. End users do not need Node or Python to launch the suite. AI provider access still needs your configured provider and network connection. Coding-agent commands require the relevant Python/Node/npm/git or other tools installed on the user’s computer; the frozen backend is not a general Python interpreter.

## Build and run

Install [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/): Rust stable, Node.js 22+, Python 3.10+ for the build, and the platform WebView/build dependencies. On Windows use the MSVC Rust toolchain and Visual Studio C++ build tools; WebView2 is supplied by Windows or installed through Tauri’s installer. macOS requires Xcode command line tools. On Linux install WebKitGTK 4.1 and GTK build dependencies.

From the repository root:

```sh
python -m pip install "pyinstaller>=6.11,<7"
# Optional Google account sign-in verification in the bundled server:
cd desktop-tauri
npm ci
npm run dev
```

Use `python3` instead of `python` where appropriate. If your build Python executable has a different name, set the `PYTHON` environment variable. The default is `python` on Windows and `python3` elsewhere. `npm run dev` stages the current SPA sources and rebuilds the sidecar before starting Tauri. There is no frontend dev server or hot reload; rerun to pick up source changes.

Create installers:

```sh
cd desktop-tauri
npm run build
```

Output: `desktop-tauri/src-tauri/target/release/bundle/` (typically Windows MSI/NSIS, macOS app/DMG, Linux deb/AppImage). Build separately on each target OS and architecture; the Python sidecar must match the Rust target. Cross-compiling a Rust shell alone does not produce a compatible backend. Production signing/notarization is not configured by this repository.

The manually triggered **Optional Tauri desktop installers** GitHub Actions workflow builds Windows, macOS and Linux artifacts and tests each frozen backend. It does not publish a release or deploy automatically.

## Runtime and storage

The shell starts its own sidecar on `127.0.0.1:47831`, waits for readiness from that exact process, then opens the desktop. All apps, relay administration, skills, research and coding-agent endpoints share that origin, avoiding CORS changes. If the port is occupied, startup fails visibly; the shell never attaches to another process. Close another TLAL OS instance and relaunch. A fixed origin preserves WebView localStorage and IndexedDB (including virtual disk) between launches. This is separate from an existing browser’s storage; use export/import to transfer projects. Provider URLs previously persisted in exported browser data may need resetting to the desktop’s relay.

Backend data lives in Tauri’s platform `app_local_data_dir` for `com.bdug.tlalos`:

- `config/providers.json`: text-provider profiles and keys.
- `config/providers.images.json`: photiX image-provider settings and key.
- `config/search.json`: search-provider settings.
- `skills/catalog.sqlite3`: cached vector skill catalog and per-app settings.
- `workspace/`: writable coding-agent workspace, scripts, learned skills and sessions.

WebView storage is managed by the platform runtime separately from these files. Removing app data removes local documents and virtual disk; export backups first. Updating/reinstalling the app should preserve app data unless explicitly removed.

The bundled suite resources are treated as read-only. Agent operations target the writable workspace, never the installed assets. Installed coding tools run with your OS account’s permissions, as in the browser/server deployment. The default executable allowlist includes only detected Python, Node, npm and git; workflow command steps remain disabled by default. Providers and commands are not executed just by building or opening the desktop.

No Tauri frontend capabilities or invoke handlers are granted to localhost pages. Native shell access is used exclusively by the Rust launcher to start/stop the packaged backend. The existing localhost server authorization model remains in place; this is not an additional OS sandbox or a network-server deployment. Exact allowed-origin controls still apply to separately hosted clients.

Closing the app sends a private stdin shutdown command. The server closes skills storage and active agent sessions before exiting; the launcher force-stops it after five seconds if necessary. Startup and installer prerequisites differ by OS and require native validation. Media codecs, browser file-system APIs and WebView behavior can differ from Chromium; use each app’s supported import/export fallbacks where needed.

## Packaging boundaries

`prepare.py` copies only the named SPA/shared/assets directories and desktop entry files. It excludes `backup/`, `.git/`, `.suite-agent/`, server source, build outputs, tests, symlinks and known provider/search config filenames. No existing user workspace, keys or runtime databases are bundled. The backend includes the shipped skill seed, not user catalog databases. Review public app assets before distributing a build if you have added private documents to application directories.

## Verification

```sh
python desktop-tauri/scripts/test_prepare.py
python desktop-tauri/scripts/prepare.py --target YOUR-RUST-TARGET --stage-only
python desktop-tauri/scripts/test_sidecar.py
```

The staging test verifies all app entries and exclusions. The sidecar test serves every app plus relay/skills over real HTTP, verifies private data creation, and checks stdin shutdown. After a full preparation, pass `--binary desktop-tauri/src-tauri/binaries/suite-server-YOUR-RUST-TARGET` (append `.exe` on Windows) to test the packaged executable itself. `npm run prepare:desktop` resolves the installed Rust host triple automatically; build for the matching host.

The implementation environment verified the actual frozen Linux sidecar, all app HTTP routes, skill database initialization, occupied-port rejection, graceful shutdown and shared controls through Chromium. The Tauri configuration validates against the installed v2 CLI schema. Rust is not installed in that environment, so the native shell, installer build and platform WebViews have not yet been compiled/run there; use the supplied native CI workflow and validate installers on their target OS before distribution.
