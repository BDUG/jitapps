# TLAL OS interface

The desktop, all **14 apps**, both additional sketchiX editors and relay settings follow [the supplied style guide](TLAL-OS-STYLE-GUIDE.md). The shared implementation is [theme.css](../shared-suite/theme.css), loaded after app styles. The optional Tauri startup screen uses the same palette and bundled font.

## Palette and typography

| Role | Color |
| --- | --- |
| Primary action / identity | Maroon `#8B1E3F` |
| Information / links / focus | Blue `#3F6F98` |
| Attention / progress accent | Orange `#D97A16` |
| Text | Graphite `#343B43` |
| Secondary / muted text | `#626A73` / `#8B9299` |
| Borders | `#D9DDE1` |
| Light surface / background / white | `#F5F6F7` / `#FAFAFA` / `#FFFFFF` |

Neutral surfaces dominate, followed by maroon, blue and restrained orange. Primary actions use maroon with white text; secondary controls are neutral or outlined. Selected controls add a border or indicator as well as color.

Variable **Inter** is bundled locally under [assets/fonts](../assets/fonts/Inter-LICENSE.txt), with Helvetica Neue/Arial/sans-serif fallbacks. No remote font request is needed. The bundled subset covers Latin; other scripts use browser fallbacks. Body text uses comfortable line spacing, labels use medium weight, interface headings use 600–700, and numeric data uses tabular numerals. Source editors retain monospace fonts; editable document typography is preserved.

## Layout and identity

Use the shared 4/8/12/16/24/32/48/64/96px spacing tokens, predictable grids, modest radii and restrained shadows. Chrome styles are separate from user diagrams, photographs, slides, SVG content and preview frames. Brand colors are not forced onto user artwork or imported documents. Semantic validation colors remain available. Reduced-motion preferences disable decorative interface transitions.

The desktop wordmark is **TLAL OS**. No master logo was supplied, so the UI does not reconstruct a circular brand mark. Launcher icons are a consistent family of blue outline drawings on neutral circles, including photiX. The README’s connected-workspace illustration accompanies the wordmark and is explicitly not master logo artwork. It uses solid brand/neutral colors, without gradients or logo effects.

## Previews and verification

![Desktop](../assets/screenshots/desktop.png)

![photiX](../assets/screenshots/photiX.png)

`BASE_URL=http://127.0.0.1:8000 node shared-suite/theme-browser-test.cjs` checks palette tokens, actual local Inter loading, control states, desktop identity/icons and mobile loading across **18 pages**. It also checks relay/photiX primary controls and preserves document/source fonts. Existing editing, photiX, agent and navigation tests cover functional regressions. These are targeted checks, not a complete accessibility certification.

Refresh the README gallery using `node scripts/capture-screenshots.cjs` with Playwright/Chromium and the suite server running. The capture uses a fresh profile and no live AI requests.
