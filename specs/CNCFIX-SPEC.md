# cncfiX · CNCF Landscape Diagram Builder Specification

## 1. Purpose
`cncfiX` is a local-first single-page application for designing, filtering, exporting, and AI-refining CNCF-style cloud native landscape diagrams.

## 2. Data Model (`cncfix-project` v1)
- **Categories**: `id`, `name` (1–120 chars), `color` (`#RRGGBB`), 1–40 categories.
- **Subcategories**: `id`, `categoryId` (must exist), `name` (1–120 chars), 1–120 subcategories.
- **Items**: `id`, `name`, `categoryId`, `subcategoryId`, `maturity` (`graduated | incubating | sandbox | platform | non-cncf`), `oss` (boolean), `homepage`, `repo`, `description`, `notes`, up to 500 items.
- **Settings**: `columns` (1–6), `cardWidth` (110–240), `showLegend`, `showMaturity`, `showOssBadge`.

## 3. Capabilities & Acceptance Criteria
1. Built-in **CNCF Catalog** (24+ cloud native projects) and 4 starter landscape templates.
2. Interactive SVG renderer (`CncfixRender.renderSvg`) with click-to-select cards, maturity legend, maturity/text filters, zoom & fit.
3. Undo/Redo stack (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`) and `localStorage` persistence + recovery.
4. Lossless **SVG** (embedded `<cncfix-project>` metadata), **2x PNG**, **CNCF `landscape.yml` YAML** round-trip (`toLandscapeYaml` / `fromLandscapeYaml`), and **JSON** export/import.
5. Full `SuiteAgentAdapter`, Content Hub visual capture (`SuiteContentHubVisual`), virtual disk, and Project ZIP support.
