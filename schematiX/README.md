# schematiX

Open `/schematiX/` in the suite browser server or desktop app. Import example files, a local folder tree, or a ZIP. Imports replace the current evidence and derived outputs; Undo restores the previous project. No source files are overwritten.

## Discovery

- JSON produces draft-2020-12 JSON Schema candidates, including mixed array types, optional observed object properties, and nested structure. Separate examples receive separate schemas. Required means present in the observed objects, not guaranteed by the domain.
- XML produces descriptive element/attribute shapes. Schema ZIP also includes a permissive XSD candidate for namespace-free XML. Namespaced XML retains its shape; the ZIP explains why no XSD was emitted. Repeated sibling shapes use the first occurrence and observed counts. Review heterogeneity, order, namespaces, cardinalities and constraints before using a schema as a contract. DTDs/entities are rejected.
- Markdown produces heading/link outlines, not a standardized Markdown validation grammar.
- DOCX paragraphs, PPTX slide text, XLSX cell values and shared strings become evidence. Formatting, formulas, charts, embedded media, dates and complete Office semantics are not reconstructed. Legacy DOC/XLS/PPT and PDF require conversion first.
- TXT, RST, CSV, JSON-LD and Turtle are text evidence. SVG supplies text/title/description metadata. PNG/JPEG/GIF/WebP supply image dimensions. Raster OCR and visual understanding require attaching the image in shared AI chat; metadata extraction does not analyze depicted meaning.

The initial graph links documents to sections and shared capitalized terms. These lexical concepts are candidates. AI can infer richer domain classes and relations using the extracted evidence.

## Visual and structured editing

Select a sketch card to edit its label/class. Drag cards to arrange the illustration, or use the keyboard-accessible node selector. Add connections by node IDs and a declared relation ID. Expand the full project JSON to add/delete nodes, edit schemas and ontology terms, remove edges, or set coordinates. Apply validates all endpoints, types and source paths. Discard restores applied values; Undo restores prior applied projects.

Applied projects autosave locally. Unapplied JSON remains a draft: Save downloads its exact text and leaving warns about pending edits. Apply before switching inputs or using AI. Browser storage is best effort; download backups. Corrupt or externally changed browser recovery is preserved until explicit replacement. Save a recovery copy first.

## AI chat and background enrichment

Configure the shared AI relay/provider. **AI enrich** prepares a request in the full suite chat, which also supports attachments, follow-ups and proposal review. **Enrich in background after import** explicitly opts into automatically sending extracted evidence after successful import. It starts the normal asynchronous chat request and retains the usual review gate; it does not silently apply generated ontology or graph edits. Provider calls may incur charges.

AI receives extracted source excerpts, schemas and the graph. Treat sensitive documents accordingly. AI proposals must preserve source evidence and pass structural validation. Review meaning, provenance, inferred constraints and relationships before applying. Examples and AI cannot prove completeness or correctness. The shared chat rejects stale proposals and offers Undo.

## Interchange

- Native project JSON preserves schemas, evidence, ontology, graph and layout. **Open project** loads it.
- Ontology JSON and graph JSON use versioned schematiX envelopes and can also be loaded using **Open project**. Ontology-only imports must remain compatible with existing graph types. Graph-only imports include source evidence and ontology, replace those components, and reset schemas.
- Schema ZIP contains JSON Schema, Markdown/XML shape JSON and supported XSD candidates.
- JSON-LD exports the knowledge graph; Turtle exports ontology classes/properties and graph triples. These are interchange exports; load the native JSON for exact editable round-trips. JSON-LD/Turtle imported as examples remain text evidence.
- SVG is an inert illustration usable in other suite graphics/document apps. The mindiX native export provides an editable map of nodes and cross-links (up to 199 graph nodes and 300 edges). Map labels are limited to 200 characters; full labels remain in topic notes. Use the shared virtual disk to move these files between apps. File format compatibility still applies.

## Bounds and verification

200 examples, 2 MB per expanded member/file, 16 MB total expanded input, 100,000 extracted characters per source, 8 MB project JSON, 2,000 nodes and 4,000 edges. JSON examples over 100,000 characters are rejected rather than inferred from truncated JSON. Office files have at most 100 selected XML parts and 8 MB expanded selected XML. Unsupported members are reported; unsafe ZIP paths reject the import. ZIPs are not recursively unpacked. Extracted text excerpts and metadata, rather than original Office/image binaries, are stored in native backups. Keep original documents separately.

```sh
node schematiX/model-test.cjs
node schematiX/browser-test.cjs
CATALOGUE_GROUP=schematiX node shared-suite/catalogue/browser-test.cjs
node scripts/verify-suite.cjs
```

Browser checks use deterministic AI responses. They verify imports, XSD generation, editing/Undo, recovery, workspace integration, background requests with reviewed application, malicious XML rejection and mobile sizing.

## Python server storage

Expand **Server projects & files** to open saved projects, **Save now**, or **Save as new project**. Edits autosave after a short delay. Each project has a separate server root with revisioned files, folders and editor state; unapplied drafts are included. Use **New folder**, Rename, Delete and per-file Download in the tree. Apply or discard pending text drafts before renaming/deleting their source files. Original local imports are not overwritten. Existing native downloads, virtual disk and browser recovery remain available.

The server defaults to `projects/` beside provider settings; change `--projects-root` or its restart setting. Run the Python suite server rather than a static-only HTTP server. Check the save status before closing. Conflicting tabs must reopen or save a new copy. Server projects survive browser recovery removal and server restart. See [storage details and limits](../server/README.md#server-backed-editor-projects).

The server tree retains original uploaded files under `imports/` and extracted evidence text under `evidence/`. Original ZIP/Office/raster bytes are kept separately from extracted text. Renaming extracted evidence updates schema and graph provenance paths together; deleting it removes its derived graph items. Externally changed evidence must be reimported to rebuild schemas.
