#!/bin/sh

echo "Cleaning up generated files and caches..."

# Remove python caches
find . -name "__pycache__" -type d -exec rm -rf {} +
find . -name "*.pyc" -type f -delete

# Remove agent and backup directories
rm -rf .suite-agent/
rm -rf backup/

# Remove Tauri desktop build artifacts
rm -rf desktop-tauri/node_modules/
rm -rf desktop-tauri/build-bin/
rm -rf desktop-tauri/build-cache/
rm -rf desktop-tauri/src-tauri/target/
rm -rf desktop-tauri/src-tauri/resources/
find desktop-tauri/src-tauri/binaries/ -type f -not -name ".gitkeep" -delete

# Remove agent analysis dependencies and models
rm -rf server/code-navigation/node_modules/
rm -rf server/models/

# Remove Standalone coding-agent library builds
rm -rf codingagentlib/rust/target/
rm -rf codingagentlib/build/
rm -rf codingagentlib/dist/
rm -rf codingagentlib/*.egg-info/
rm -rf codingagentlib/python/code-navigation/node_modules/

echo "Cleaning up configuration files..."
rm -f providers.json providers.images.json search.json server-settings.json google-device.json
rm -rf skills/

echo "Resetting tracked configuration files..."
git checkout -- shared-suite/google-drive-config.json

echo "Cleanup complete."
