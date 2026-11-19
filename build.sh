#!/bin/sh
# Works from any current directory. PYTHON selects the build interpreter.
set -eu
BUILD_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "${PYTHON:-python3}" "$BUILD_ROOT/build.py" "$@"
