# mockiX · Wireframe studio

Design editable interface wireframes and clickable screen flows. Open `/mockiX/` on the suite server or launch **mockiX** from the desktop. It provides a focused local wireframing workflow inspired by tools such as MockFlow; it does not import MockFlow files or connect to that service.

## Create a mockup

Start with a dashboard, sign-in flow, mobile app or blank screen. Click a component in the library, or drag it onto the canvas. Components include headings, text, buttons, fields, checkboxes, radios, toggles, cards, image placeholders, navigation, sidebars, tabs, tables, lists, dividers and icons.

Use the Layers list to select overlapping components. Select a component to change its label, position, dimensions, colors, font size and screen link. Drag to move on an eight-pixel grid; use the lower-right handle to resize. Arrow keys nudge by eight pixels; Shift+Arrow moves one pixel. Duplicate, delete and change layer order in the inspector. Ctrl/⌘ D duplicates; Ctrl/⌘ Z and Shift+Ctrl/⌘ Z undo/redo. Undo history retains the last 60 edits.

Add or duplicate screens, name them, and choose desktop, tablet, mobile or custom dimensions. Resizing a screen clamps existing components to its bounds. Clean and sketch styles share the same editable geometry. Deleting a screen clears links to it. Replacing a project with a template can be undone.

## Preview and save

Set a component's **Link to screen**, then choose **Preview**. Click linked components or activate them with Enter/Space; Back returns to the previous screen. This is screen navigation, not a functional form or production UI.

- **Save JSON** exports the complete editable project. **Open** imports a validated JSON project (up to 8 MB).
- **Export SVG** saves the current screen, without selection handles.
- **Export prototype** creates a standalone HTML file containing all screens and clickable navigation. It runs locally without the server; its generated navigation script does not execute document text.
- The current project saves automatically in this browser. If storage is unavailable, export JSON to keep your work. The suite's virtual disk can also receive exports or open a project through its mockiX import target.

Limits: 8 MB of formatted project JSON, 40 screens, 300 components per screen, 1,200 components per project. Screens are 240–2,400 px wide and 240–4,000 px tall. Component labels support plain text, newlines and `|` separators for table/navigation cells. Image components are placeholders; external assets, scripts and arbitrary HTML are unsupported.

## AI chat

Open **AI chat** and use your configured suite relay. Ask for a new wireframe, a multi-screen flow, or changes to the selected screen/component. Chat receives the current document and selection. It can answer questions or propose a full native document; review the proposed edit before applying it. Invalid geometry and broken screen links are rejected. Changes preserve undo and autosave. Provider credentials stay on the relay; document context is sent to the configured provider when included.

Manual wireframing does not need AI or a paid account. No real-time multiplayer service is included.

## Design tools and reusable components

Shift-click canvas components or Layers entries to build a multi-selection; Ctrl/⌘ A selects editable, visible layers on the current screen. Dragging or arrow-key nudging moves the selection together while keeping it within the screen. Use the design inspector to align edges/centers, distribute at least three components evenly, or stack components horizontally/vertically with a chosen gap. Stacking is an explicit layout operation, not a continuously recomputed constraint system; it rejects a stack that will not fit.

Rectangle, ellipse and frame primitives supplement the UI components. Corner radii, project accent/surface/text colors, layer visibility and locks support more polished mockups. Project colors are saved swatches; **Apply colors to selection** copies them to selected components. Locked layers are protected from direct movement, geometry edits, layout and deletion. Hidden layers are omitted from the canvas, prototype and screen exports. Select hidden or locked layers in the Layers list to show or unlock them.

To reuse a design, select one component, enter a name and choose **Create component**. Insert instances from the saved component list. Edit one instance and select **Update linked instances** to update its definition and all linked instances across screens. Updates copy component type, label, dimensions, colors, typography and radius; they preserve each instance's ID, position, prototype target, visibility and lock state, clamping geometry to fit its screen. This explicit definition update can update locked instances. **Detach selection** makes editable selected instances independent. There are up to 60 saved definitions; these are single-component masters, not nested component trees or variant sets.

## User flow map

Open **User flows** to map a journey separately from screen editing. **From screen links** builds screen steps and connections from the existing clickable prototype (replacing the flow map after confirmation when it already contains steps).

Add start, screen, action, decision or end steps. Select a step to edit its label or link it to an existing screen; **Open screen** returns to that screen in the editor. Drag steps to arrange them, or use **Arrange** for a grid. Connect steps using the From/To selectors and labels such as Yes, No, Paid or Retry. Decision branches and loops are allowed. Deleting a step removes its associated connections. Deleting a screen also removes flow steps linked to that screen and their connections. Flow maps allow up to 120 steps and 240 connections, export as standalone SVG, and use the same project-wide undo/redo history.

Flow arrows document a journey. They do not automatically create clickable hotspots or execute conditional application logic; component **Link to screen** fields still control the interactive prototype.

**Ask AI** in the flow editor opens chat with a flow-generation prompt. Chat's native schema includes project colors, reusable definitions, instance links, layer states and flow nodes/edges. Ask it to generate an onboarding journey, add decision branches, or refine screen layouts; proposals remain validated and reviewed before application. Older mockiX JSON projects gain empty flow/component libraries and default project colors when opened.

These are native Figma-style design and Flowstep-style planning features. Figma `.fig` import/export, Figma account integration, live multiplayer editing, nested auto-layout constraints and external Flowstep synchronization are not included.

## Suite visual identity

mockiX uses the shared TLAL OS theme and bundled Inter font for editor controls, neutral surfaces, focus states and maroon primary actions. Its wireframe-window icon follows the suite's 64 × 64 circular neutral badge with blue linework and an orange accent. The same asset appears in the header, favicon, desktop and app navigation. The wordmark uses the suite's emphasized X. These styles apply to editor chrome; native screen/component colors and exported prototypes retain their document styling.
