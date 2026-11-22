#!/usr/bin/env python3
"""Build local desktop installers, the native VSIX, or coding-agent SDK packages."""
import argparse
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
TARGETS = ("desktop", "vscode", "python", "javascript", "rust")


def extension_target():
    systems = {"Linux": "linux", "Darwin": "darwin", "Windows": "win32"}
    machines = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}
    system, machine = platform.system(), platform.machine().lower()
    if system not in systems or machine not in machines:
        raise ValueError(f"Unsupported native VSIX host: {system}/{machine}")
    return f"{systems[system]}-{machines[machine]}"


def plan(target, install=False):
    """Return ordered (working directory, argv) steps and artifact locations."""
    python = sys.executable
    cargo = os.environ.get("CARGO", "cargo")
    folder = ROOT / ("desktop-tauri" if target == "desktop" else "codingagentlib")
    steps = []
    if target == "desktop":
        if install:
            steps += [(ROOT, [python, "-m", "pip", "install", "pyinstaller>=6.11,<7"]),
                      (folder, ["npm", "ci", "--ignore-scripts"])]
        steps += [(folder, ["npm", "run", "build"])]
        output = folder / "src-tauri/target/release/bundle"
    elif target == "vscode":
        folder /= "vscode"
        host = extension_target()
        version = json.loads((folder / "package.json").read_text(encoding="utf-8"))["version"]
        output = ROOT / "dist/vscode" / f"codingagentlib-{host}-{version}.vsix"
        if install:
            steps += [(folder, ["npm", "ci", "--ignore-scripts"])]
        # Build only once; VSCE's prepublish hook checks the resulting native worker.
        steps += [(folder, ["npm", "run", "verify"]),
                  (folder, ["npm", "exec", "--no", "--", "vsce", "package", "--target", host, "--out", str(output)])]
    elif target == "python":
        output = ROOT / "dist/python"
        if install:
            steps += [(ROOT, [python, "-m", "pip", "install", "build>=1,<2"])]
        # Do not run from ROOT (build.py) or codingagentlib (setuptools build/):
        # either would shadow the installed PyPA build module on sys.path[0].
        steps += [(output, [python, "-m", "build", "--outdir", str(output), str(folder)])]
    elif target == "javascript":
        output = ROOT / "dist/javascript"
        steps += [(folder / "javascript", ["npm", "pack", "--pack-destination", str(output)])]
    else:
        output = ROOT / "dist/rust/package"
        steps += [(ROOT, [cargo, "package", "--locked", "--manifest-path", str(folder / "rust/Cargo.toml"),
                          "--target-dir", str(ROOT / "dist/rust")])]
    return steps, output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, epilog="Builds for the current OS/architecture; nothing is published. See docs/BUILDING.md.")
    parser.add_argument("target", choices=(*TARGETS, "sdks", "all"))
    parser.add_argument("--install-deps", action="store_true", help="Install locked npm dependencies and Python packaging tools with the current Python")
    parser.add_argument("--dry-run", action="store_true", help="Print commands and outputs without writing files or running tools")
    args = parser.parse_args(argv)
    targets = TARGETS if args.target == "all" else TARGETS[2:] if args.target == "sdks" else (args.target,)
    try:
        plans = [(target, *plan(target, args.install_deps)) for target in targets]
        if not args.dry_run:
            # Catch missing executables before any build/install step changes files.
            commands = {command[0] for _, steps, _ in plans for _, command in steps}
            if "desktop" in targets:
                commands.update({os.environ.get("CARGO", "cargo"), "rustc"})
            if "vscode" in targets:
                commands.add(os.environ.get("CARGO", "cargo"))
            missing = sorted(command for command in commands if not shutil.which(command))
            if missing:
                raise ValueError("Missing executable(s): " + ", ".join(missing) + ". See docs/BUILDING.md for prerequisites.")
        for target, steps, output in plans:
            print(f"\n=== {target} ===", flush=True)
            if not args.dry_run:
                (output.parent if target == "vscode" else output).mkdir(parents=True, exist_ok=True)
            for cwd, command in steps:
                print(f"[{cwd.relative_to(ROOT) or '.'}] {shlex.join(command)}", flush=True)
                if not args.dry_run:
                    # Reuse this interpreter for the desktop's Python sidecar build.
                    env = dict(os.environ, PYTHON=sys.executable)
                    subprocess.run([shutil.which(command[0]) or command[0], *command[1:]], cwd=cwd, env=env, check=True)
            print(f"{'Planned output' if args.dry_run else 'Build output'}: {output}", flush=True)
        return 0
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return error.returncode if isinstance(error, subprocess.CalledProcessError) and error.returncode > 0 else 1
    except KeyboardInterrupt:
        print("Build interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
