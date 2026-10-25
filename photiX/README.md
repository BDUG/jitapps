# photiX

A local-first, agentic raster image editor in the TLAL OS desktop suite.

Run `python3 server/server.py --port 8000` at the repository root and open `http://localhost:8000/photiX/`. Configure your AI provider through the desktop relay settings. Image tools work without an AI provider.

## Editing

Load PNG, JPEG or WebP from local disk or the shared virtual disk. Drag across the image to select a rectangle; the edit scope switches to **Selected area**. Choose **Whole image** for global changes. Zoom changes the view, preserving original pixel coordinates.

Manual and AI edits support brightness, contrast, saturation, grayscale, invert, blur, pixelation, colored fills and text captions. Edits form an ordered nondestructive recipe over the original image. Undo/redo restores complete project states. Browser storage retains the latest project when space permits.

Open **AI chat**, include the current image project and ask, for example:

- “Pixelate the selected area with 12-pixel blocks.”
- “Increase brightness to 115 percent across the whole image.” (Choose Whole image first.)
- “Add the caption ‘Summer’ to this selection in white, 32 pixels.”

The assistant returns a complete project proposal. Review before applying. Validation preserves source pixels, dimensions and existing edits, and confines appended operations to the chosen scope. Chat supports follow-up questions and revisions through the shared relay and also includes the suite coding-agent tab.

The relay receives project data and selected coordinates as structured text, including embedded source pixels. This integration does not supply a provider-native vision or generative-image API. The standard text chat supports deterministic edit commands. The separate **Generative image chat** sends source PNGs, masks and optional references to the configured image provider for generative edits. Semantic object selection and arbitrary painting are not implemented. No provider credentials are stored by this app.

## Saving

Use **Save / export** for PNG, JPEG, WebP or an editable JSON project. The suite export chooser supports computer and virtual disk. JPEG discards transparency. Keep JSON to preserve the original and recipe; exported images flatten all operations. Images are limited to 4096 × 4096 and recipes to 100 edits. Large projects can exceed browser storage or provider context capacity; export a backup.

## Verification

`node photiX/browser-test.cjs` checks region selection, pixel containment, scope validation, undo/redo, a mocked relay proposal reviewed and applied through chat, PNG export, and persistence. Set `BASE_URL` when the server differs from `http://127.0.0.1:8027`. A live paid AI provider is not required by this test.

## Generative image tools

In **Generative image chat**, choose an action, enter a prompt and click **Generate preview**. Each request uses the image API rather than the text-chat API and can incur provider charges. Select one to three variations. Options stay separate from the document until **Apply option**; Undo restores the previous complete project. A changed project invalidates earlier previews. Failed/stopped batches retain options that already completed. Stopping a browser request cannot guarantee that a provider cancels work or billing.

| Tool | Behavior |
| --- | --- |
| Generative fill | Send the image and a transparent edit mask; composite returned pixels strictly inside the captured rectangular scope. |
| Remove / replace object | Ask the image model to reconstruct the selected area; source pixels outside it are preserved. |
| Generative expand | Add 16–1024 pixels per edge, generate the extension, then copy the original center back exactly. Final canvas must fit 4096 × 4096. |
| Generate image | Create a new image from a prompt; preview before replacing the document. |
| Harmonize | Ask the model to match lighting, color and shadows within the selected scope, optionally guided by a reference image. |
| Remove background | Request transparent background pixels from a compatible image model. Quality and transparency depend on the model. |
| Reference image | Load from computer or virtual disk. Sent as a second image for edits; generation does not accept a reference in this adapter. |
| Transform & upscale | Preview crop-to-selection, 90° rotation, horizontal flip or 2×/4× high-quality browser resampling. Upscaling is not AI detail reconstruction. |

Generative edits flatten earlier recipes into a new source image when applied. Save a JSON backup or use Undo to preserve the prior recipe. Selections are rectangles; there is no automatic object segmentation, lasso, brush mask, layered compositing or Photoshop plug-in compatibility. This is an independent implementation, not Adobe/Firefly integration or Photoshop feature parity.

### Image provider setup

Restart the updated server. Open **Desktop → AI relay → Open provider settings**, then **photiX image provider**. The default endpoints are OpenAI Images `/v1/images/generations` and `/v1/images/edits`, with model `gpt-image-1`. Supply a key with image-model access, or configure an OpenAI Images-compatible local gateway. Image configuration is separate from the active text-chat provider and is saved beside the main config as `<config-stem>.images.json` with owner-only permissions. Keys are not returned to the app/UI; leaving the key blank retains it for unchanged endpoints, and changing an endpoint clears an omitted key. Settings can be imported/exported separately; exports omit the key.

The adapter requires PNG base64 results in `data[0].b64_json`, multipart `image[]` and `mask` support for editing, and optional multiple input images / `background=transparent` support for reference and transparency features. Chat-only providers, URL-only responses and provider-specific Firefly/Gemini/Eden image APIs are not interchangeable with this protocol. Gateway support varies. No provider URL or credential is supplied by photiX requests. Cross-origin apps use the relay's exact allowed-origin list. Requests allow up to 40 MB encoded JSON, and provider output up to 50 MB.

Run `python3 -m unittest server.image_provider_test` for real HTTP relay/fixture-provider coverage, private configuration checks, masks, references and CORS. Run `node photiX/generative-browser-test.cjs` with `BASE_URL` (default port 8031) for mocked-provider previews, exact pixel preservation, variations, expansion, upscaling and stale-preview rejection. Live paid image quality has not been tested.

## Project ZIP

Use **Project ZIP** in the header, or **Workspace → Recovery → Import / export project ZIP**, to save and restore the complete native project. Choose Computer or Virtual disk. Imports validate and stage a review; applying preserves the previous project in Recovery. Embedded assets are included, while separate app/relay settings and external workspace files are excluded. See the [shared ZIP guide](../shared-suite/PROJECT-ZIP.md).

## Shared editor layout

photiX uses the suite’s compact header, accented X wordmark, blue outline camera icon, local-save indicator, neutral canvas workspace and maroon primary controls. Tools scroll independently of the canvas, including the generative and transform panels. The layout adapts to narrow screens; status messages remain clear of the shared navigation dock. Controls indicate busy operations while image rendering completes.
