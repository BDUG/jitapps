<p align="center">
  <img src="assets/agentic-desktop-suite.svg" alt="Agentic Desktop Tool Suite — Create. Connect. Automate." width="920">
</p>

# Agentic Desktop Tool Suite

A local-first collection of desktop-style tools that run in your browser. Design systems, draw vectors, organize mind maps, plan projects, write documents, create presentations, work with spreadsheets, edit code, automate workflows, and turn web research into reports—all from one repository.

AI agents extend every tool through a shared relay: adapt architecture, refine SVG artwork, draft documents and slide decks, analyze spreadsheets, review code changes, generate single-page apps, design workflows, and compile or discuss source-backed reports. The editors work independently; AI features use the provider configured on your relay server.

## Project disclosure

This repository is developed as a personal hobby project for learning, experimentation, and enjoyment. It is not developed for commercial purposes or offered as a commercial product.

The project is licensed under the [MIT License](LICENSE), which permits commercial use. This disclosure describes the project's development purpose and does not add restrictions to the license. Third-party dependencies retain their respective licenses.

## The tools

| Tool | Workspace | What you can do |
| --- | --- | --- |
| [Architex](architex/README.md) | Architecture | Edit metamodels and instance graphs, connect ports, run scripted validation, and collaborate with an AI agent. |
| [graphiX](graphiX/README.md) | Vector graphics | Draw and edit SVG artwork with layers, properties, resizing, and SVG/PNG export. |
| [sketchiX](sketchiX/README.md) | Diagrams & sketches | Edit diagrams, draw freehand sketches, design reusable vector shapes with separate AI chats, and exchange draw.io, SVG, PlantUML, PPTX and Visio VSDX. |
| [mindiX](mindiX/README.md) | Mind mapping | Build hierarchical maps with notes/tasks, arrange and collapse branches, collaborate with AI, and export draw.io, SVG and PPTX. |
| [projectiX](projectiX/README.md) | Project planning | Schedule tasks and milestones in a Gantt chart, review AI plans, exchange Microsoft Project XML, and export XLSX, SVG and draw.io. |
| [textiX](textiX/README.md) | Documents | Write and format rich text, insert tables and images, find and replace, and export or print documents. |
| [presentiX](presentiX/README.md) | Presentations | Create slide decks with text, shapes, images and speaker notes, exchange PPTX files, present, and review AI-generated edits. |
| [sheetiX](sheetiX/README.md) | Spreadsheets | Work with formulas, multiple sheets, formatting, sorting, and XLSX/CSV/JSON interchange. |
| [appiX](appiX/README.md) | App generation | Generate and refine self-contained apps with AI, edit HTML/CSS/JavaScript, run a sandboxed preview, and export single-file apps. |
| [codeiX](codeiX/README.md) | Code & agents | Manage project files, edit and search code, and review AI-proposed file changes before applying them. |
| [automatextiX](automatextiX/README.md) | Workflow automation | Connect JSON transforms, shared-workspace files, AI calls, approved local commands, web requests, branching, and execution logs. |
| [reportiX](reportiX/README.md) | Research & reporting | Discover sources with Google or Bing, crawl public pages, and compile or discuss cited AI reports with tables and SVG charts. |

## Get started

No frontend build or package installation is needed. From the repository root, start the suite with Python 3:

```sh
python3 server/server.py
```

The server listens on port **8000** by default. Open `/` for the **desktop launcher** with all 12 apps, searchable cards, distinct icons and the shared virtual disk. Each app also has a Desktop shortcut. You can open a tool directly:

| Tool | Path |
| --- | --- |
| Architex | `/architex/` |
| graphiX | `/graphiX/` |
| sketchiX | `/sketchiX/` |
| mindiX | `/mindiX/` |
| projectiX | `/projectiX/` |
| textiX | `/textiX/` |
| sheetiX | `/sheetiX/` |
| presentiX | `/presentiX/` |
| codeiX | `/codeiX/` |
| appiX | `/appiX/` |
| automatextiX | `/automatextiX/` |
| reportiX | `/reportiX/` |
| AI provider settings | `/relay` |

This server supplies static hosting, the shared AI relay, and reportiX's crawling API. Use `--port` to choose another port or `--config /path/to/providers.json` to select an existing relay configuration.

All backend features now live in the dedicated [`server/`](server/README.md) directory. The old `architex/server.py` and `reportiX/server.py` commands are compatibility launchers for this same backend (default ports 8000 and 8010 respectively). Only one process is needed.

A plain static server (`python3 -m http.server 8000`) or direct `index.html` opening supports local editing, but does not provide an AI relay or crawling backend. Keep the repository folders together: some tools reuse vendored libraries from `architex/vendor/`.

## Shared virtual disk

Every app can additionally export files to a shared browser disk. Select **Exports: virtual disk** in the bottom-left suite controls, then use the app's usual export or backup button. Choose the file name and destination folder in the disk dialog.

To reopen a file, click **Virtual disk**, choose an **Import into** reader, select a compatible file and click **Import selected**. Architex offers separate model scopes and rule readers; codeiX and Sphinx RST readers support complete folder trees. Upload files or folders from your computer, create folders, download selected items (folders as ZIP), or delete them from the same dialog. Choose **Exports: computer** to resume normal downloads.

The disk persists in IndexedDB and is shared by all apps at the **same server address, port and browser profile**. It does not sync between computers or to the relay. Clearing browser site data removes it, so download important backups. Binary files are preserved; the disk allows up to 50 MiB per file and each app retains its own format/size limits. See the [virtual disk guide](shared-suite/README.md) for details.

## Connect an AI agent

1. Start a relay-capable server and open its `/relay` provider settings.
2. Configure and test a provider. The relay supports OpenAI, Gemini, Eden AI, LiteLLM, OpenRouter, and compatible gateways.
3. In an AI-enabled tool, set its **AI relay** URL to the server origin. Provider endpoints, models, and API keys are configured on the relay rather than in each editor.
4. Open **AI chat** in an editor (or the integrated codeiX agent), choose the context and reference attachments, and ask questions or request changes. Proposed edits require review before application. reportiX also retains its dedicated source-backed report compiler.

See the [shared AI chat guide](shared-ai/README.md) for tool-specific context, schemas, review, Undo and request diagnostics.

AI calls require a configured provider and network access. Crawling additionally requires public DNS and outbound access to search and source hosts. The current managed cloud environment restricts live discovery and DNS resolution; see [reportiX setup and limitations](reportiX/README.md).

## Your workspace, your files

Tools autosave their work locally in browser storage and provide explicit import/export options. Export backups before clearing browser data. Local autosave is not cross-device synchronization or a filesystem write.

AI-enabled tools send selected context through the relay to its configured provider. Workflow HTTP steps make requests when you run them, and research collection fetches the requested public pages. Basic editing does not require an AI account.

Each tool's README describes its formats, supported features, limits, and verification commands. The suite is browser-based; it does not install native desktop applications or provide a shared background execution service.
