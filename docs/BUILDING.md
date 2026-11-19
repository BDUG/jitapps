# Build packaged applications and SDKs

Run the root scripts from any working directory. They use the repository beside
the scripts, stop on the first failing command and never publish packages.
Browser use of the suite still needs no build.

```sh
./build.sh desktop --install-deps   # Tauri application and native installers
./build.sh vscode --install-deps    # Native coding-agent VS Code extension
./build.sh sdks --install-deps      # Python, JavaScript and Rust packages
./build.sh all --install-deps       # All of the above, sequentially
./build.sh all --dry-run            # Show exact commands without changing files
```

On Windows use PowerShell with the same arguments:

```powershell
.\build.ps1 desktop --install-deps
.\build.ps1 vscode --install-deps
```

Or call `python build.py TARGET` directly on any platform (`python3` where
appropriate). Targets are `desktop`, `vscode`, `python`, `javascript`, `rust`,
`sdks` and `all`. With dependencies already installed, omit `--install-deps`.
The switch runs `npm ci --ignore-scripts` for desktop/extension builds and
installs Python packaging tools for desktop/Python builds. npm's explicit build
and packaging lifecycle hooks still run. SDK packages use their existing
manifests; no version numbers are changed.

## Prerequisites

- **All targets:** Python 3.10+ for the orchestrator. Use a virtual environment
  when installing Python tools. The shell/PowerShell wrappers respect `PYTHON`;
  the orchestrator passes its own interpreter to the desktop sidecar build.
- **Desktop:** Node.js 22+, npm, Rust stable/Cargo, Python with
  `pyinstaller>=6.11,<7`, and your OS's [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
  Linux needs WebKitGTK 4.1 and native build libraries; Windows needs MSVC build
  tools; macOS needs Xcode command-line tools. See the [desktop guide](../desktop-tauri/README.md).
- **VS Code:** Node.js 22+, npm, Rust stable/Cargo. The script builds the native
  worker, runs extension tests, then packages a VSIX using the local VSCE.
  Supported script host combinations: Linux/macOS/Windows on x64/arm64.
  Run it on the machine/architecture that will host the extension.
- **Python SDK:** `python -m pip install 'build>=1,<2'`. Builds a wheel and source
  distribution using the package's isolated setuptools build backend.
- **JavaScript SDK:** npm; `npm pack` creates the local installable tarball.
- **Rust SDK:** Rust stable/Cargo; `cargo package --locked` creates and verifies
  the crate, without publishing it. Cargo requires committed crate sources;
  commit any local changes inside `codingagentlib/rust/` before packaging.

`--install-deps` requires network access and does not install OS libraries,
Node, Rust or Python. Cargo may fetch locked dependencies; Python isolated
builds may fetch their build backend. `CARGO` can select a custom Cargo binary;
normal Cargo/npm cache and registry environment variables are inherited.

## Artifacts

| Target | Output |
| --- | --- |
| `desktop` | `desktop-tauri/src-tauri/target/release/bundle/` — host installers |
| `vscode` | `dist/vscode/codingagentlib-OS-ARCH-VERSION.vsix` |
| `python` | `dist/python/` — `.whl` and `.tar.gz` |
| `javascript` | `dist/javascript/` — npm `.tgz` |
| `rust` | `dist/rust/package/` — verified `.crate` and extracted verification sources |

Build each desktop/extension artifact on its destination OS/architecture; these
scripts do not cross-compile the Python backend or Rust worker. Custom
`CARGO_TARGET_DIR` settings can move desktop outputs. Signing, notarization,
marketplace publishing and installation are separate steps. Build outputs are
ignored by Git and existing output folders are retained between runs.

For development use the underlying package commands in the
[desktop](../desktop-tauri/README.md), [VS Code](../codingagentlib/vscode/README.md)
and [SDK](../codingagentlib/README.md) guides. The root scripts wrap those tools;
they do not rebuild or deploy projects exported from individual apps.

Validate the orchestrator with `python -m unittest discover -s scripts -p 'test_build.py'`.
