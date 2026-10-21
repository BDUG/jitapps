# vidiX · Motion studio

A browser video and animation editor in the Agentic Desktop suite. Arrange clips on a layered timeline, trim source video, animate text and shapes, and export a silent video, looping GIF, animated SVG or still frame. AI chat proposes reviewable timeline changes through the same relay used by the other tools.

## Start

From the repository root:

```sh
python3 server/server.py
```

Open `http://localhost:8000/vidiX/`, or choose **vidiX** on the desktop. No frontend build or conversion server is required. The starter contains a moving spotlight, title and caption.

## Edit a project

1. Use **Import media** and choose **Local disk** or **Virtual disk**. Videos in browser-decodable containers (commonly MP4, WebM, Ogg), GIF, SVG, PNG, JPEG and WebP are accepted. Codec support depends on your browser; an extension alone does not ensure decoding.
2. Imported assets appear in the media library. Click **Add clip** to put an asset on the timeline. Add **Vector animation**, **Text**, **Rectangle** and **Ellipse** layers without importing anything.
3. Select a layer to edit start time, duration, position, dimensions, color, opacity and fade. **End X / End Y** animate position linearly across the clip. Video **Trim in** chooses the source start; **Speed** changes playback speed. A clip must fit both the project duration and source video duration.
4. Drag a timeline bar horizontally to change its start. Use **Duplicate**, **Delete**, and **Layer ↑ / ↓** to compose layers. Later entries render above earlier entries. Use the timeline zoom slider for longer projects.
5. Scrub the playhead or use **Play**, **Pause**, and **Stop**. GIF source frames are decoded and sampled from the timeline, including frame delays, looping and disposal. Video frames are sought to the requested source time. Position, opacity and fades affect all layer types.
6. **Undo / Redo** restore timeline edits and project imports. **Save project** creates a JSON bundle containing media and the full editable timeline; **Open project** restores it from either disk. Local browser autosave is best effort and may not fit larger media projects—save an explicit project backup.

## Export formats

| Format | Behavior |
| --- | --- |
| WebM video | Records the composed canvas as a **silent** video using a codec supported by MediaRecorder. Export runs in real time; slow decoding or a throttled background tab can affect timing/frame rate. Keep the tab visible. |
| MP4 video | Available when the current browser supports MP4 MediaRecorder encoding. If unsupported, choose WebM; this app does not install a codec or transcode server-side. |
| Animated GIF | Offline looping animation, using actual timeline frames. Maximum 300 output frames and 640 pixels on the longest side. The project frame rate controls sampling; GIF timing is quantized to hundredths of a second. |
| Animated SVG | Self-contained SVG with text/shapes, position animation and fades. Video and GIF assets become embedded PNG poster frames; their **layer** movement/fades animate, but their source motion does not. Imported SVG assets are also captured as images rather than inserted as executable markup. |
| PNG frame | Exports the current composed playhead frame at project resolution. |
| vidiX JSON project | Full editable project with embedded source media. Use this for backups and further editing. |

Use **Exports: computer / virtual disk** to choose the destination for all exports. **Cancel export** stops generation without saving a partial file. Animated SVG playback requires a viewer that supports SMIL; some document/image viewers show only a static frame.

SVG imports decode in image context, with scripts and external resources disabled. Browser-native SVG animation can run on its own clock; seekable SVG source animation is not supported. To preserve deterministic source animation when editing, import GIF or video instead. SVG output generated from native vidiX layers uses its own timeline animation.

This version has no audio track editing/mixing, waveform, transitions beyond movement/fades, keyframe curves, or server-based transcoding. It edits layers on a canvas rather than losslessly cutting/re-encoding original video streams. Project dimensions are limited to 1920×1080, 120 seconds and 30 fps, with at most 100 layers and 100 imported assets. Media files are limited to 20 MB each and roughly 34 MB combined embedded data; project files are limited to 50 MB. GIF imports allow at most 300 frames and 30 million decoded pixels. The shared disk and browser storage have their own quotas.

## AI chat

Configure and test a provider using the desktop's **AI relay** settings, then open **Create with AI** or **AI chat**. Ask questions, refine an existing proposal over multiple turns, attach reference files or request a complete animation. Inspect the proposed changes and **Apply reviewed edit**; **Undo AI edit** restores the prior project. **New conversation** clears chat history without clearing the timeline.

Example:

> Create a six-second looping title card saying “Hello, motion!” with a dark purple background, a yellow circle moving from left to right, and a white title that fades in and out. Use editable layers and return the complete project proposal.

Then refine it:

> Make the title larger, slow the circle down by extending the project to eight seconds, and preserve all layer IDs.

The assistant receives the project schema, timing, layer properties and imported asset **metadata**. It does not receive source video/image bytes, cannot hear/watch clips, and cannot generate or fetch a new media asset. It may create native text/shapes, reference existing asset IDs, and propose validated timing/trim changes. All AI edits pass the same validator used by manual editing; no proposal runs code or exports automatically.

## Verification

With Playwright and Chromium installed and the suite server running:

```sh
node vidiX/model-test.cjs
node vidiX/browser-test.cjs
```

Tests cover timeline validation, interpolation/fades, source references and trim/speed bounds, history/persistence, actual GIF/SVG/PNG/WebM bytes, animated frame differences, exported-media reimport, local/virtual project round trips, atomic rejection, mocked AI review/apply/Undo and a mobile viewport. They do not establish every browser's MP4 codec support, live provider availability or frame-accurate playback on slow machines. GIF libraries and licenses are documented in [vendor/README.md](vendor/README.md).

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Frame drawings and graphiX tools

Use **Vector animation** to add a vector layer. **Edit drawing · graphiX** opens the same editor used by graphiX, with rectangle, ellipse, line, freehand and text tools, multiple selection, grouping/ungrouping, drag movement and resizing, fill/stroke/opacity, SVG source, zoom/pan, object order and its own Undo/Redo. Each drawing retains its SVG objects, IDs, styles and groups. **Apply drawing** commits it to the vidiX timeline with Undo support; **Cancel** discards that editor session. Editing frames does not overwrite the standalone graphiX document.

**Frame ◀ / ▶** steps at the project frame rate. At the current playhead, **New blank frame** inserts/replaces a drawing; **Duplicate drawing here** copies the currently held drawing into that frame so you can change it independently. Editing a held frame creates a drawing at that frame. Drawings hold until the next drawing; they do not interpolate their internal object paths. Frame numbers shown are one-based; the saved `frames:[{frame,svg}]` indices are zero-based and relative to the vector clip's start. Frame zero is required and cannot be deleted. Click F1, F2, etc. beneath a vector layer to jump to its drawings. Changing frame rate changes the drawings' timing; shortening a clip or changing fps that would leave drawings outside the clip is rejected until those drawings are removed.

The layer list shows frontmost first. Select a layer, toggle its visibility or lock, and use **Bring front / Send back** or **Layer ↑ / ↓** to reorder it. Locked layers prevent manual property edits, deletion, timeline dragging and frame editing; visibility and locks can still be toggled. Vector object grouping and multi-selection operate inside each frame drawing. Visibility applies to preview and every export. Animated SVG keeps vector drawings as inert embedded SVG images with discrete frame changes; GIF, PNG and video use the same frame sampler. Save/Open project, autosave, AI proposals and Undo/Redo preserve frame drawings, visibility and locks. Existing projects continue to load.

Example AI prompt:

> Add a one-second vector layer with four frame drawings of a smiley changing expression. Use editable SVG circles and paths, preserve existing media, and return the complete project including frames starting at frame 0.

Additional checks: `node vidiX/frames-browser-test.cjs` and `node graphiX/grouping-browser-test.cjs`.
