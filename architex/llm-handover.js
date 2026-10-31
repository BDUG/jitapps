(function (root) {
  "use strict";
  async function read(name) {
    const url = new URL(name, document.baseURI);
    let response, text;
    try {
      response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw Error("HTTP " + response.status);
      text = await response.text();
    } catch {
      throw Error(
        "Could not load " +
          name +
          ". " +
          (location.protocol === "file:"
            ? "Open the app through python3 server/server.py instead of file://."
            : "Serve Architex with all handover files. Check the app connection and reload the page."),
      );
    }
    if (text.length > 2 * 1024 * 1024)
      throw Error("Handover file exceeds 2 MB");
    return text;
  }
  async function loadSchemas() {
    let catalog;
    try {
      catalog = JSON.parse(await read("schemas/catalog.json"));
    } catch (e) {
      if (e instanceof SyntaxError)
        throw Error(
          "Could not parse schemas/catalog.json. Serve the actual Architex schema files; the server returned non-JSON content.",
        );
      throw e;
    }
    return validateSchemas(catalog);
  }
  function validateSchemas(catalog) {
    if (
      !catalog ||
      catalog.format !== "architex-schema-catalog" ||
      catalog.version !== 1 ||
      !catalog.schemas ||
      JSON.stringify(catalog.schemas.workspace) !==
        JSON.stringify(Architex.schema)
    )
      throw Error(
        "Schema catalogue is missing or stale. Run node architex/generate-schemas.cjs after schema changes.",
      );
    for (const key of [
      "agentRequest",
      "metamodel",
      "instanceModel",
      "componentConnectionPolicy",
      "instanceDataPoint",
      "ruleLibrary",
      "relayConnection",
      "assistantProposal",
      "validationFinding",
      "sphinxRSTProject",
    ])
      if (!catalog.schemas[key])
        throw Error("Schema catalogue is missing " + key);
    return catalog;
  }
  async function createRequest(context, instruction, signature) {
    if (!context.metamodel || !context.instanceModel)
      throw Error(
        "Both metamodel and instance model are required for architecture chat.",
      );
    if (!globalThis.crypto?.subtle)
      throw Error(
        "Structured AI handovers require HTTPS or localhost for workspace snapshot hashing.",
      );
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(signature),
    );
    const digest = Array.from(new Uint8Array(bytes), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    return {
      format: "architex-agent-request",
      version: 1,
      requestId: crypto.randomUUID(),
      workspaceDigest: digest,
      task: { instruction },
      scope: {
        includedSections: [
          "metamodel",
          "instanceModel",
          ...(context.ruleLibrary ? ["ruleLibrary"] : []),
        ],
        modelEdits: "review-required",
      },
      responseContract: {
        proposalFormat: "architex-proposal",
        version: 1,
        echoFields: ["requestId", "workspaceDigest"],
        changedSections:
          "Complete arrays for each changed section; omit unchanged sections.",
        preserve:
          "Stable IDs, unrelated entities, parameters, colors, directions and geometry.",
        verification:
          "Validate both models together, all references, direction/type policies and enabled rules.",
      },
      ...context,
    };
  }
  function contextReference(context) {
    if (
      !root.SuiteAgentProtocol ||
      context.protocol !== root.SuiteAgentProtocol.version ||
      !Object.hasOwn(context, "document")
    )
      return context;
    return {
      protocol: context.protocol,
      requestId: context.requestId,
      documentDigest: context.documentDigest,
      payloadLocation:
        "The complete current request is supplied in the user message JSON. Read its actual values; this reference is not a replacement or summary of the document.",
      documentSections: Object.keys(context.document || {}),
      attachmentCount: context.attachments?.length || 0,
      fields: {
        task: "user message.task",
        document: "user message.document",
        attachments:
          "user message.attachments; binary inputs are native media parts",
        schemas:
          "Complete catalogue below and user message.contextSchema/modelSchemas/proposalSchema",
        workflow:
          "user message.workflow contains confirmed import options and source provenance when present",
      },
    };
  }
  async function render(context, guide) {
    const [template, catalog] = await Promise.all([
      read("llm-handover.md"),
      loadSchemas(),
    ]);
    const values = {
      SCHEMAS: JSON.stringify(catalog),
      VALIDATION_API: guide,
      CONTEXT: JSON.stringify(contextReference(context), null, 2),
    };
    for (const key of Object.keys(values))
      if (!template.includes("{{" + key + "}}"))
        throw Error("Handover template is missing {{" + key + "}}");
    return template.replace(
      /\{\{(SCHEMAS|VALIDATION_API|CONTEXT)\}\}/g,
      (_, key) => values[key],
    );
  }
  function bundledSchemas() {
    return JSON.parse(
      JSON.stringify(validateSchemas(root.ArchitexSchemaCatalog)),
    );
  }
  root.ArchitexHandover = {
    loadSchemas,
    bundledSchemas,
    createRequest,
    render,
  };
})(window);
