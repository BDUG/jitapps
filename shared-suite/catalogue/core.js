/* Native starter documents and content-preserving layout themes. No execution. */
(function (root) {
  "use strict";
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const names = {
    mockiX: ["Service request portal", "Course onboarding"],
    colabriX: ["Product discovery workshop", "Team decision workshop"],
    designiX: ["Community event poster", "Product announcement"],
    photiX: ["Exhibition image caption", "Product photo label"],
    vidiX: ["Workshop opening title", "Product release teaser"],
    architex: [
      "Knowledge platform architecture",
      "Service operations architecture",
    ],
    graphiX: ["Event information card", "Process overview infographic"],
    textiX: ["Product requirements specification", "Research interview guide"],
    sheetiX: ["Risk register", "Content production planner"],
    codeiX: ["Accessible information page", "Project documentation site"],
    appiX: ["Event registration screen", "Service feedback screen"],
    automatextiX: ["Order priority routing", "Support ticket triage"],
    reportiX: ["Technology evaluation brief", "Customer discovery report"],
    presentiX: ["Project kickoff deck", "Research findings deck"],
    sketchiX: ["Service request workflow", "Release readiness workflow"],
    mindiX: ["Product discovery map", "Learning plan map"],
    projectiX: ["Website delivery plan", "Workshop preparation plan"],
    shelliX: ["Workspace inventory", "Environment overview"],
  };
  const topics = {
    architex: [
      [
        "Web portal",
        "Knowledge API",
        "Search service",
        "Content store",
        "Identity service",
        "Audit service",
      ],
      [
        "Service portal",
        "Request API",
        "Routing service",
        "Operations store",
        "Identity service",
        "Notification service",
      ],
    ],
    mindiX: [
      [
        "Product discovery",
        "Users",
        "Interviews",
        "Observation",
        "Problem",
        "Evidence",
        "Assumptions",
        "Experiments",
        "Prototype",
        "Evaluation",
      ],
      [
        "Learning plan",
        "Goals",
        "Current skills",
        "Gaps",
        "Practice",
        "Exercises",
        "Resources",
        "Feedback",
        "Review",
        "Next steps",
      ],
    ],
    projectiX: [
      [
        "Website delivery",
        "Discovery",
        "Audience and goals",
        "Content design",
        "Implementation",
        "Accessibility review",
        "Release",
      ],
      [
        "Workshop preparation",
        "Define outcomes",
        "Invite participants",
        "Prepare materials",
        "Facilitate workshop",
        "Document decisions",
        "Follow-up actions",
      ],
    ],
    sketchiX: [
      ["Receive request", "Is the request complete?", "Route to service owner"],
      ["Prepare release", "Are checks complete?", "Approve release"],
    ],
  };
  function entries(tool) {
    if (!names[tool]) throw Error("Unknown app catalogue.");
    const specific = {
      projectiX: [
        "Compact timeline",
        "Spacious timeline",
        "Adjusts the timeline zoom without changing project tasks.",
      ],
      automatextiX: [
        "Horizontal workflow",
        "Staggered workflow",
        "Arranges workflow nodes while preserving their configuration and connections.",
      ],
      reportiX: [
        "Executive report structure",
        "Evidence-first report structure",
        "Adds a report structure preference to the brief; sources and existing reports stay intact.",
      ],
      shelliX: [
        "Tabular command report",
        "Sectioned command report",
        "Loads a formatted reporting snippet into the command draft; never executes it.",
      ],
      photiX: [
        "Cool caption band",
        "Warm caption band",
        "Adds an editable footer-band operation; source pixels and earlier operations stay intact.",
      ],
    };
    const v = specific[tool];
    return [
      ...names[tool].map((name, i) => ({
        id: "starter-" + i,
        name,
        kind: "template",
        description:
          "Editable native starting point with illustrative placeholders. Replaces current content after review.",
      })),
      {
        id: "blue",
        name: v?.[0] || "Studio blue layout",
        kind: "layout",
        description:
          v?.[2] ||
          "Light surfaces, blue accents and dark readable text. Preserves content IDs, links and timing.",
      },
      {
        id: "warm",
        name: v?.[1] || "Warm editorial layout",
        kind: "layout",
        description:
          v?.[2] ||
          "Warm surfaces, maroon accents and dark readable text. Preserves content IDs, links and timing.",
      },
    ];
  }

  function theme(tool, doc, id) {
    const d = copy(doc),
      accent = id === "warm" ? "#8b1e3f" : "#3f6f98",
      surface = id === "warm" ? "#fffaf5" : "#f5f8fb",
      pale = id === "warm" ? "#f7e9e3" : "#e5eff7",
      ink = "#343b43";
    if (tool === "shelliX")
      return {
        command:
          id === "warm"
            ? "printf '\\n## Environment\\n'; uname -s; printf '\\n## Directory\\n'; pwd"
            : "printf 'SECTION\\tVALUE\\n'; printf 'Directory\\t'; pwd; printf 'System\\t'; uname -s",
        cwd: ".",
        timeout: 10000,
      };
    if (tool === "textiX") {
      d.html =
        '<div style="color:' +
        ink +
        ";background-color:" +
        surface +
        ';font-family:Arial;line-height:1.6">' +
        d.html +
        "</div>";
      return d;
    }
    if (tool === "sheetiX") {
      for (const sheet of d.sheets)
        for (const [address, c] of Object.entries(sheet.cells)) {
          c.style = {
            ...c.style,
            textColor: ink,
            ...(/^[A-Z]+1$/.test(address)
              ? { background: accent, textColor: "#ffffff", bold: true }
              : { background: surface }),
          };
        }
      return d;
    }
    if (tool === "codeiX" || tool === "appiX") {
      const css =
        "\n/* Catalogue layout */\nbody{font-family:Arial,sans-serif;color:" +
        ink +
        ";background:" +
        surface +
        ";line-height:1.6;margin:0 auto;max-width:72rem;padding:2rem}h1,h2,a{color:" +
        accent +
        "}button{background:" +
        accent +
        ";color:white;padding:.7rem 1rem;border:0;border-radius:.4rem}";
      if (tool === "appiX") d.css = (d.css || "") + css;
      else {
        const path = "catalogue-layout.css";
        if (d.files.some((f) => f.path === path))
          throw Error(
            "A catalogue layout stylesheet already exists. Edit it in codeiX.",
          );
        d.files.push({ path, content: css });
        for (const f of d.files)
          if (/\.html?$/.test(f.path) && !f.path.includes("/"))
            f.content = (f.content || "").replace(
              /<\/head>/i,
              '<link rel="stylesheet" href="' + path + '"></head>',
            );
      }
      return d;
    }
    if (tool === "graphiX" && root.DOMParser) {
      const xml = new root.DOMParser().parseFromString(d.svg, "image/svg+xml");
      if (xml.querySelector("parsererror")) throw Error("Invalid SVG source.");
      xml.documentElement.style.color = ink;
      xml.documentElement.style.backgroundColor = surface;
      d.svg = new root.XMLSerializer().serializeToString(xml);
      return d;
    }
    if (tool === "graphiX") {
      d.svg = d.svg
        .replace(
          /<svg\b([^>]*)>/,
          '<svg$1 style="color:' + ink + ";background:" + surface + '">',
        )
        .replace(/#3f6f98/gi, accent);
      return d;
    }
    if (tool === "automatextiX") {
      d.nodes.forEach((v, i) => {
        v.x = 55 + i * 260;
        v.y = id === "warm" ? 80 + (i % 2) * 180 : 150;
      });
      return d;
    }
    if (tool === "reportiX") {
      d.brief +=
        "\nLayout preference: " +
        (id === "warm"
          ? "narrative executive summary followed by evidence and caveats."
          : "structured overview, comparison table, evidence and recommendations.");
      return d;
    }
    if (tool === "photiX") {
      d.operations.push({
        type: "fill",
        region: {
          x: 0,
          y: Math.floor(d.height * 0.82),
          width: d.width,
          height: d.height - Math.floor(d.height * 0.82),
        },
        value: 100,
        color: surface,
      });
      return d;
    }
    function visit(v) {
      if (!v || typeof v !== "object" || v.locked) return;
      if (Array.isArray(v)) {
        v.forEach(visit);
        return;
      }
      for (const [key, value] of Object.entries(v)) {
        if (typeof value === "string") {
          if (key === "background" && /^#/.test(value)) v[key] = surface;
          else if (
            ["fill", "stroke", "color"].includes(key) &&
            /^#[a-f\d]{3,8}$/i.test(value)
          )
            v[key] =
              key === "stroke"
                ? accent
                : key === "color" || v.type === "text"
                  ? ink
                  : pale;
        } else visit(value);
      }
    }
    visit(d);
    return d;
  }
  function create(tool, id, seeds, current) {
    if (!entries(tool).some((e) => e.id === id))
      throw Error("Unknown catalogue entry.");
    if (["blue", "warm"].includes(id))
      return tool === "projectiX"
        ? {
            format: "suite-timeline-layout/v1",
            timelineScale: id === "blue" ? "compact" : "spacious",
          }
        : theme(tool, current, id);
    const n = Number(id.slice(-1)),
      name = names[tool][n];
    if (tool === "shelliX")
      return {
        command: n
          ? "printf 'System: '; uname -s; printf 'Directory: '; pwd"
          : "printf 'Current directory\\n'; pwd; printf '\\nFiles\\n'; ls",
        cwd: ".",
        timeout: 10000,
      };
    const d = copy(seeds[tool]);
    if (!d) throw Error("The native starter is unavailable.");
    d.name = name;
    if (tool === "textiX") {
      d.html =
        "<h1>" +
        name +
        "</h1><p><strong>Owner:</strong> [Name] · <strong>Version:</strong> [Version]</p>" +
        (n
          ? "<h2>Research objective</h2><p>[Question and intended audience]</p><h2>Participants and consent</h2><p>[Recruitment criteria and consent process]</p><h2>Interview prompts</h2><ol><li>[Describe your current workflow.]</li><li>[Where does it become difficult?]</li><li>[What would a successful outcome look like?]</li></ol><h2>Observations and follow-up</h2><p>[Record evidence separately from interpretation.]</p>"
          : '<h2>Problem and users</h2><p>[Problem, audience and measurable outcome]</p><h2>Scope and non-goals</h2><ul><li>In scope: [Deliverable]</li><li>Out of scope: [Boundary]</li></ul><h2>Requirements</h2><table><tr><th scope="col">ID</th><th scope="col">Requirement</th><th scope="col">Acceptance criterion</th></tr><tr><td>R1</td><td>[User capability]</td><td>[Observable result]</td></tr></table><h2>Verification and open questions</h2><p>[Proposed checks, constraints and unresolved decisions]</p>');
    }
    if (tool === "sheetiX") {
      const headers = n
        ? ["Content", "Owner", "Channel", "Status", "Target date"]
        : ["Risk", "Likelihood", "Impact", "Score", "Response"];
      const values = n
        ? [
            headers,
            ["[Content item]", "[Owner]", "[Channel]", "Draft", "[Date]"],
          ]
        : [headers, ["[Risk]", 2, 3, "=B2*C2", "[Mitigation]"]];
      d.sheets[0].name = n ? "Content plan" : "Risks";
      d.sheets[0].cells = {};
      values.forEach((row, r) =>
        row.forEach(
          (value, c) =>
            (d.sheets[0].cells[String.fromCharCode(65 + c) + (r + 1)] = {
              value: String(value),
              style: {},
            }),
        ),
      );
    }
    if (tool === "codeiX" || tool === "appiX") {
      const html =
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        name +
        "</title></head><body><main><h1>" +
        name +
        "</h1><p>[Describe the audience and purpose.]</p><section><h2>Overview</h2><p>[Add information.]</p></section><section><h2>Next steps</h2><p>[Add instructions and contact details.]</p></section></main></body></html>";
      if (tool === "codeiX")
        d.files = [
          { path: "index.html", content: html },
          {
            path: "README.md",
            content:
              "# " +
              name +
              "\n\nEditable starter. Replace bracketed placeholders; verify accessibility before publishing.",
          },
        ];
      else {
        d.html =
          "<main><h1>" +
          name +
          '</h1><p>[Instructions]</p><form><label>Your name<input name="name" autocomplete="name"></label><label>Your message<textarea name="message"></textarea></label><button type="button">Review details</button></form><p>Demonstration layout; submission is not connected.</p></main>';
        d.js = "";
        d.css =
          "main{max-width:48rem;margin:auto;padding:2rem}label{display:block;margin:1rem 0}input,textarea{display:block;width:100%}";
        d.brief =
          name +
          " with editable placeholders and no connected submission service.";
      }
    }
    if (tool === "graphiX")
      d.svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><title>' +
        name +
        '</title><rect width="960" height="640" fill="#f5f8fb"/><text x="60" y="90" font-family="Arial" font-size="36" fill="#343b43">' +
        name +
        "</text>" +
        ["Purpose", "Details", "Next step"]
          .map(
            (t, i) =>
              '<g><rect x="' +
              (60 + i * 295) +
              '" y="160" width="260" height="330" rx="14" fill="#ffffff" stroke="#3f6f98"/><text x="' +
              (80 + i * 295) +
              '" y="210" font-family="Arial" font-size="24" fill="#343b43">' +
              t +
              '</text><text x="' +
              (80 + i * 295) +
              '" y="260" font-family="Arial" font-size="16">[Add content]</text></g>',
          )
          .join("") +
        "</svg>";
    if (tool === "architex") {
      delete d.name;
      d.metamodel.name = name;
      d.metamodel.components.forEach((c, i) => {
        c.name = topics[tool][n][i % 6];
        c.description =
          "[Describe responsibilities, interfaces and constraints.]";
      });
      d.metamodel.dependencies.forEach((e) => (e.label = "Uses"));
    }
    if (tool === "automatextiX") {
      d.nodes[0].config.data = n
        ? '[{"name":"Example ticket","amount":120}]'
        : '[{"name":"Example order","amount":160}]';
      d.nodes.forEach(
        (v, i) =>
          (v.name = [
            n ? "Incoming tickets" : "Incoming orders",
            "Priority threshold",
            "Priority route",
            "Standard route",
            "Combine routes",
            "Record result",
          ][i]),
      );
    }
    if (tool === "automatextiX") {
      d.nodes.forEach((v, i) => {
        v.x = 55 + i * 260;
        v.y = id === "warm" ? 80 + (i % 2) * 180 : 150;
      });
      return d;
    }
    if (tool === "reportiX") {
      d.query = n
        ? "[Customer problem to investigate]"
        : "[Technology options to evaluate]";
      d.brief = n
        ? "Structure: research questions, participant evidence, observations, themes, limitations and follow-up. Do not invent participants or quotes."
        : "Structure: decision context, options, comparison criteria, source evidence, tradeoffs, limitations and recommendation. Do not invent evidence.";
      d.webSearch = false;
    }
    if (tool === "presentiX")
      d.slides.forEach((s, i) => {
        s.title = [
          name,
          n ? "Evidence and limitations" : "Goals and scope",
          n
            ? "Recommendations and next steps"
            : "Milestones and responsibilities",
        ][i % 3];
        s.notes = "[Speaker notes and evidence references]";
        s.elements
          .filter((e) => e.type === "text")
          .forEach(
            (e, j) =>
              (e.text = j ? "[Add concise supporting points.]" : s.title),
          );
      });
    if (tool === "sketchiX") {
      d.nodes.forEach((v, i) => (v.label = topics[tool][n][i % 3]));
      d.edges.forEach((e, i) => (e.label = i ? "Ready" : "Review"));
    }
    if (tool === "mindiX")
      d.nodes.forEach((v, i) => {
        v.text = topics[tool][n][i % 10];
        v.notes = "[Add evidence, examples or actions.]";
      });
    if (tool === "projectiX") {
      d.tasks.forEach((v, i) => {
        v.name = topics[tool][n][i % 7];
        v.notes = "[Owner, deliverable and acceptance criteria]";
        v.progress = 0;
      });
    }
    if (tool === "mockiX") {
      d.screens.forEach((s, i) => {
        s.name = i ? "Request details" : name;
        s.elements
          .filter((e) =>
            ["heading", "text", "button", "navbar", "table"].includes(e.type),
          )
          .forEach(
            (e, j) =>
              (e.text =
                e.type === "button"
                  ? "View details"
                  : e.type === "table"
                    ? "Item | Owner | Status\n[Item] | [Owner] | Draft"
                    : e.type === "navbar"
                      ? "Overview | Details | Help"
                      : j === 0
                        ? name
                        : "[Add helpful instructions]"),
          );
      });
    }
    if (tool === "colabriX") {
      const labels = n
        ? [
            "Decision to make",
            "Options and evidence",
            "Tradeoffs and next steps",
          ]
        : [
            "Users and needs",
            "Ideas and assumptions",
            "Experiments and learning",
          ];
      let i = 0;
      d.items.forEach((v) => {
        if (v.type === "frame") {
          v.text = v.name = labels[i++ % 3];
        } else if (v.type === "note")
          v.text = "[One observation or action per note]";
      });
    }
    if (tool === "designiX")
      d.pages.forEach((p) => {
        p.name = name;
        p.elements
          .filter((e) => e.type === "text")
          .forEach(
            (e, i) =>
              (e.text = [
                n ? "NEW RELEASE" : "YOU ARE INVITED",
                name,
                n
                  ? "[Benefit] · [Availability] · [Contact]"
                  : "[Date] · [Time] · [Location]",
              ][i % 3]),
          );
      });
    if (tool === "vidiX") {
      delete d.name;
      d.project.name = name;
      d.project.clips
        .filter((c) => c.type === "text")
        .forEach((c, i) => (c.text = i ? "[Date or call to action]" : name));
    }
    if (tool === "photiX")
      d.operations = [
        {
          type: "text",
          region: {
            x: 50,
            y: Math.floor(d.height * 0.78),
            width: d.width - 100,
            height: 100,
          },
          value: 32,
          color: "#343b43",
          text: name + " · [Add details]",
        },
      ];
    return tool === "photiX" ? d : theme(tool, d, "blue");
  }
  const api = { entries, create, theme, names };
  root.SuiteNativeCatalogue = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
