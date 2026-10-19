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

## Screenshots

The desktop and all 12 apps, shown with their built-in starting workspaces. Click a screenshot to view it at full size.

### Desktop

[![Desktop launcher with all 12 apps and shared virtual disk](assets/screenshots/desktop.png)](assets/screenshots/desktop.png)

### Applications

| | |
| --- | --- |
| **[Architex](architex/README.md)**<br>[![Architex editor workspace](assets/screenshots/architex.png)](assets/screenshots/architex.png) | **[graphiX](graphiX/README.md)**<br>[![graphiX editor workspace](assets/screenshots/graphiX.png)](assets/screenshots/graphiX.png) |
| **[sketchiX](sketchiX/README.md)**<br>[![sketchiX editor workspace](assets/screenshots/sketchiX.png)](assets/screenshots/sketchiX.png) | **[mindiX](mindiX/README.md)**<br>[![mindiX editor workspace](assets/screenshots/mindiX.png)](assets/screenshots/mindiX.png) |
| **[projectiX](projectiX/README.md)**<br>[![projectiX editor workspace](assets/screenshots/projectiX.png)](assets/screenshots/projectiX.png) | **[textiX](textiX/README.md)**<br>[![textiX editor workspace](assets/screenshots/textiX.png)](assets/screenshots/textiX.png) |
| **[presentiX](presentiX/README.md)**<br>[![presentiX editor workspace](assets/screenshots/presentiX.png)](assets/screenshots/presentiX.png) | **[sheetiX](sheetiX/README.md)**<br>[![sheetiX editor workspace](assets/screenshots/sheetiX.png)](assets/screenshots/sheetiX.png) |
| **[appiX](appiX/README.md)**<br>[![appiX editor workspace](assets/screenshots/appiX.png)](assets/screenshots/appiX.png) | **[codeiX](codeiX/README.md)**<br>[![codeiX editor workspace](assets/screenshots/codeiX.png)](assets/screenshots/codeiX.png) |
| **[automatextiX](automatextiX/README.md)**<br>[![automatextiX editor workspace](assets/screenshots/automatextiX.png)](assets/screenshots/automatextiX.png) | **[reportiX](reportiX/README.md)**<br>[![reportiX editor workspace](assets/screenshots/reportiX.png)](assets/screenshots/reportiX.png) |

To refresh these images, start the suite server and run `node scripts/capture-screenshots.cjs` with Playwright and Chromium installed. The capture script uses a fresh browser profile and does not call AI providers.

## Agentic examples

Configure a provider in the relay, open an app's **AI chat** (the integrated agent in codeiX), and send one of these prompts. These are examples to try, with the intended results—not recorded provider responses. Review the proposed changes and apply them to update the editor; a chat answer alone does not change your content. Export the result using the app's normal export controls.

| App | Example chat prompt | Intended result |
| --- | --- | --- |
| **graphiX** | “Create a smiley: a yellow circular face, two dark eyes and a curved black smile, centered on the canvas. Return editable SVG artwork as a drawing proposal.” | An editable smiley drawing; export it as **SVG** and insert it into other tools from the virtual disk. |
| **Architex** | “Create a small weather-monitoring system with Sensor, Gateway and Dashboard component definitions and one instance of each. Define compatible directional connection policies, give the instances temperature data-point ports, and connect Sensor → Gateway → Dashboard. Include useful descriptions and parameters.” | A consistent **metamodel and instance graph** to review, validate and export as JSON, YAML or draw.io. |
| **sketchiX** | “Draw a UML-style order flow with Customer, Web shop, Payment service and Warehouse. Connect them with labeled arrows for placing, paying for and shipping an order. Use distinct colors and a clear left-to-right layout.” | An editable connected **diagram**; export as draw.io, SVG or PPTX. |
| **mindiX** | “Create a mind map for a community garden, with branches for Site, People, Budget, Planting and Maintenance. Add three practical subtopics per branch, with notes explaining the next action.” | A hierarchical **mind map** with editable topics and notes; export as JSON, SVG, draw.io or PPTX. |
| **projectiX** | “Plan a six-week community-garden launch starting 2026-11-02. Include site approval, recruiting volunteers, buying supplies, preparing beds, planting and an opening milestone. Give tasks durations, sensible dependencies and owners. Treat dates and costs as planning assumptions.” | An editable **project schedule and Gantt chart**; export as Microsoft Project XML, XLSX or SVG. |
| **textiX** | “Draft a one-page volunteer welcome guide for a community garden. Include a title, short introduction, safety checklist, a two-column table of roles and responsibilities, and a friendly closing. Use sample details and label them as placeholders.” | A formatted **document**; export as DOCX, HTML or Markdown. |
| **presentiX** | “Create a five-slide pitch for a community garden: vision, community benefits, proposed site, launch plan and volunteer call to action. Use concise text, coordinated colors and simple editable shapes, plus speaker notes. Label unverified details as assumptions.” | An editable **presentation** with five slides and speaker notes; export as PPTX. |
| **sheetiX** | “Create a sample garden budget with Item, Quantity, Unit price and Total columns. Add seeds (10 × 3), soil (8 × 12), tools (5 × 25) and signs (2 × 18). Calculate row totals and a grand total with formulas, and format prices as currency.” | An editable **spreadsheet** with formulas and a grand total of **287**; export as XLSX or CSV. |
| **appiX** | “Build a complete, self-contained Tetris game with arrow-key controls, rotation, line clearing, score, pause and restart. Include clear instructions and a responsive game board. Return the full HTML, CSS and JavaScript app proposal.” | A playable **single-page app** in the sandboxed preview; export as HTML. |
| **codeiX** | “Add a self-contained garden watering calculator to this project in a new watering.html file. Let users enter bed area and water depth, validate the inputs, and calculate liters as square meters × millimeters. Include accessible labels and verification steps. Preserve existing files.” | A reviewable **file change** adding a calculator; apply it and export the project ZIP or write it to a linked local workspace. Run suggested checks yourself. |
| **automatextiX** | “Create a manual workflow that reads garden-notes.txt from the virtual disk, passes its contents to an AI step asking for a concise action checklist, and writes the returned checklist to garden-actions.txt. Pass each step's result to the next and do not overwrite an existing output file.” | An editable **file → AI → file workflow**. Add the input file first, review mappings, then run it with a configured provider; the resulting checklist appears on the virtual disk. |
| **reportiX** | “Using only the sources already collected in this workspace, write a concise report comparing community-garden watering options. Cite source IDs, add a comparison table, and explain evidence gaps. Include a chart only if the sources provide comparable numeric data.” | A source-backed **report proposal** with citations and a table; apply it and export HTML or print to PDF. Collect sources using search/crawl or import research before sending this prompt. |

Continue the conversation to refine the result. For the graphiX smiley, try: **“Make the smile wider and add rosy cheeks. Preserve the face and eye positions.”** Review and apply the new proposal, then export the updated SVG. The same request → review → apply → refine cycle works across the suite. Use **New conversation** when you want to start without the previous chat history.

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
