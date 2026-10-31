# Multimodal chat and coding-agent requests

The shared AI chat and the **Coding agent** tab accept image, audio, PDF and UTF-8 text reference files. Returned provider media is displayed alongside the text response. Restart the suite/relay server after upgrading; the relay advertises `multimodalVersion: 1` while preserving the existing text-chat protocol.

## Send references

1. Use **Attach files**, **Attach reference files**, or the coding agent's **Attach images, audio, PDF or text** control. The normal local-disk and virtual-disk source chooser remains available.
2. Choose PNG, JPEG, WebP or GIF images, WAV/MP3 audio, PDF, or UTF-8 text files. Attachments receive unique names. Images show a thumbnail; other files show their type and name.
3. Enter a request describing how the references should be used. Choose a provider/model capable of reading those formats in relay settings. Sending a picture does not make a text-only model a vision model.
4. Send the request, or start/resume the coding agent. Regular chat keeps draft reference files until removed or the page reloads. References already sent can also remain in earlier conversation turns; use New conversation to clear that history and remove any draft references you no longer want to send. Coding-agent references are saved with the follow-up event and consumed from its draft attachment list after the event is saved. They remain available to later steps and after loading the session.

There is no new application file-count or attachment-size cap. Browser memory, request transmission, provider file/context limits, and the source storage's limits still apply. Images are sent as image parts, audio as native input-audio parts, and PDFs as file parts. Binary base64 is not split into text pages or presented as if it were decoded text. Text attachments remain readable text in the structured request.

For text-only requests, existing paging behavior is unchanged. **Requests containing native media, or requesting media output, use a direct provider call even if text paging is set to Always page.** Text paging cannot preserve native image/audio/file semantics by splitting their encoded bytes. If the provider rejects a large multimodal context, use fewer/smaller references, a suitable model, or a focused new conversation. The application does not silently discard files, substitute OCR/transcripts, or claim to have inspected unsupported media.

## Choose the response format

Each chat mode has a **Response** selector:

- **Text / structured edits** is the default. Existing text requests omit the optional modality setting for compatibility.
- **Text + images** requests `text,image` output from supporting OpenAI-compatible gateways/models, or `TEXT,IMAGE` from Gemini.
- **Audio + text** requests OpenAI-compatible audio output with the `alloy` voice and WAV encoding. Gemini requests native `AUDIO` output, which can return audio without text.

Model support varies; many chat models accept images but cannot generate them. A gateway may support only some of these part types or output settings. The selector requests a capability; it does not install a model or route through the separate photiX image-provider configuration. A media-generation model can generate media at every planning step when that output mode is selected; use Text for ordinary coding. Select a provider/model whose native chat endpoint supports the chosen modality.

## Use returned media

The relay normalizes actual provider outputs into `media` items containing a name, MIME type, kind, and inline `dataUrl` or HTTPS `url`. It preserves text and media in the same reply, and accepts media-only responses. Supported forms include Gemini `inlineData`, OpenAI-compatible image content/images arrays, inline file parts, and audio data. Inline PDFs and other Gemini media are downloadable file artifacts. Native 16-bit PCM audio (including Gemini `audio/L16;codec=pcm;rate=24000`) is losslessly wrapped in a WAV container for playback/download; sample rate and channel metadata are validated. Provider file IDs that require another authenticated API, tool-call results, and the separate Responses API are not resolved automatically.

Media cards offer:

- **Preview:** raster images, audio controls, and provider-supplied inline video where the browser supports its codec. Audio/video do not autoplay. PDF and other files appear as file cards; returned SVG/HTML is not inserted as active markup.
- **Download media:** preserve the actual bytes in a computer download.
- **Save to virtual disk:** choose a path; existing files require confirmation. Use an app's normal Import/Insert controls to load that file afterwards.
- **Use as reference:** add a supported inline image, WAV/MP3 or PDF to that chat mode's next draft request. This does not apply a project edit.

Remote HTTPS media is shown as an explicit **Open provider media** link. It is not fetched by the relay, loaded automatically into a preview, or given provider credentials. Download it through the provider/browser if you want a local copy; its URL may expire. Unsafe schemes and URLs containing credentials are rejected.

App document/file changes still require the normal structured proposal identifiers, validation, review and stale-content checks. Media accompanying a textual answer does not bypass those checks. A media-only regular-chat reply can be displayed without inventing a document proposal. Conversation JSON exports retain returned media; imported media remains reference material and can be explicitly reused through Use as reference.

## Coding-agent behavior

Every planning request includes named `multimodalReferences` metadata and actual native media parts. Compression preserves text schemas and identifiers while keeping attachment bytes out of the textual context view. The complete reference data remains in the saved session. Independent review can receive the run's input media but requests a text verdict.

Provider media is retained as a `media_response` event, appears in the live activity log, survives session reload, and is included in the run's session audit/result package. It is not an executable action, a verification result, or an automatic workspace file write. To use it in an app, download/save/import it explicitly or attach it as a reference for a subsequent valid proposal.

**A media-only coding response pauses the run immediately instead of executing a guessed plan or repeatedly generating media.** The status explains that a structured plan is missing. Select **Text / structured edits**, then **Resume / send follow-up** to continue the saved run. References and returned media remain available, and existing accepted file changes remain in place. Ordinary planning responses still require the exact current session ID and numeric step, allowed tools, dependency checks and completion checks.

Regular chat media is page-session data unless exported or saved. Coding sessions retain their attachment/media bytes on the server under the normal private `.suite-agent` state. Result logs, packages and conversation exports can contain these files; review them before sharing. No provider key is added to the frontend.

## Provider and transport coverage

| Protocol | Request handling | Response handling |
| --- | --- | --- |
| OpenAI-compatible: OpenAI, LiteLLM, OpenRouter, Eden v3 | Validated native text/image/audio/PDF content parts forwarded to the configured model | Text blocks, image parts/images arrays, inline audio and transcript; optional image/audio output requests |
| Gemini | Text plus `inlineData` with the correct MIME type | Visible text and non-thought inline media; native response modality settings |
| Legacy Eden v2 | Text only | Text only; multimodal requests fail with guidance to use the OpenAI-compatible v3 protocol or another model |

Unsupported binaries fail with an actionable file-type message. If an output limit truncates text but the provider returned media, the media and labelled partial text are retained; that partial text cannot propose an edit or execute an agent action. A coding run pauses for a new request. Output limits without media, invalid media, provider refusals and unsupported capabilities remain errors; binary data never becomes executable HTML, a tool call or an automatically applied app document.

## Verification

```sh
python3 -m unittest server.multimodal_test
node shared-ai/multimodal-test.cjs
node shared-ai/multimodal-browser-test.cjs
```

These checks cover native part adapters, binary preservation, invalid/unsafe input, mixed/media-only replies, direct transport despite paging settings, previews/downloads, virtual-disk saves, codeiX chat, persisted coding references/media, reload/resume and absence of media-triggered tool execution. Browser/provider responses are mocked; no paid provider call or live model capability certification is included.

### Attachment continuity

The coding-agent reference picker keeps selections after starting a run. Remove a selection explicitly to stop adding it to future runs; prior copies are still part of an existing session's history. Start a fresh session after removing a file if that historical reference must be excluded too.

Each coding-agent model step now has an explicit `attachments` collection reconstructed from saved user reference events, including UTF-8 text as well as native media. Exact duplicate references are combined; different content remains distinguishable. Text contents stay complete when aggressive context compression is enabled, while binary inputs retain their native media parts. Saved event references restore model access after reload even when the picker itself is empty.

Paging repeats complete small text references in `attachmentContext` on every provider call; larger ones remain available as named, lossless resources. Regression checks: `node shared-ai/attachment-continuity-test.cjs` and `node shared-ai/multimodal-browser-test.cjs`.

codeiX exposes the coding-agent interface only. Its standalone AI chat has been removed; attach references and select response modes in the coding-agent panel. Other apps retain their Chat and Coding agent tabs.

## Standalone VS Code extension

The native VS Code extension also accepts explicit workspace image, WAV/MP3 and PDF snapshots through **Attach files**. It sends named native parts through its OpenAI-compatible or relay provider connection. Saved references survive steps, history compression and resume; the latest attached snapshot for a path is active. Draft removal does not erase references already saved to a session. See the [extension guide](../codingagentlib/vscode/README.md#native-multimodal-references-v025) for supported formats, provider requirements and native transport limits.

## Reference notes and image detail

Browser chat and coding-agent attachment lists let you add a **Reference note** for each image, audio file or PDF: identify its role (current screen versus target design), a page/time range to focus on, or a region to inspect. The note is untrusted reference metadata alongside its unique filename; it is not an instruction override, automatic crop, transcript, or verification result. Notes are retained with saved agent references.

Images offer **Automatic**, **Low · overview**, and **High · fine details**. Explicit choices travel as native image `detail` settings and in reference descriptors. Source bytes are unchanged. Supporting OpenAI-compatible providers interpret the detail hint; Gemini inline-data conversion does not implement this hint. High detail can increase provider input cost. The default leaves provider behavior unchanged. Editing a draft note/detail does not rewrite earlier saved conversation turns.
