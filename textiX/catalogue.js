/* Built-in, editable native documents. Placeholders are examples, not generated facts. */
(function (root) {
  "use strict";
  const rows = (headers, data) =>
    "<table><thead><tr>" +
    headers.map((h) => '<th scope="col">' + h + "</th>").join("") +
    "</tr></thead><tbody>" +
    data
      .map(
        (row) =>
          "<tr>" +
          row.map((cell) => "<td>" + cell + "</td>").join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table>";
  const templates = [
    {
      id: "project-brief",
      name: "Project brief",
      description:
        "A structured project overview with scope, deliverables and acceptance criteria.",
      tags: ["project", "planning"],
      html:
        "<h1>Project brief</h1><p><strong>Project:</strong> [Name] · <strong>Owner:</strong> [Owner] · <strong>Date:</strong> [Date]</p><h2>Purpose and audience</h2><p>[Describe the problem and who benefits.]</p><h2>Scope</h2><ul><li>In scope: [Deliverable]</li><li>Out of scope: [Boundary]</li></ul><h2>Deliverables</h2>" +
        rows(
          ["Deliverable", "Owner", "Acceptance criteria"],
          [["[Deliverable]", "[Owner]", "[Observable result]"]],
        ) +
        "<h2>Milestones and risks</h2><p>[Milestones, dependencies and open questions.]</p>",
    },
    {
      id: "meeting-notes",
      name: "Meeting notes",
      description: "Agenda, decisions and follow-up actions with owners.",
      tags: ["meeting", "actions"],
      html:
        "<h1>Meeting notes</h1><p><strong>Date:</strong> [Date] · <strong>Participants:</strong> [Names]</p><h2>Objective</h2><p>[What should this meeting achieve?]</p><h2>Agenda</h2><ol><li>[Topic and intended outcome]</li></ol><h2>Discussion</h2><p>[Record relevant observations.]</p><h2>Decisions</h2><ul><li>[Decision and rationale]</li></ul><h2>Actions</h2>" +
        rows(
          ["Action", "Owner", "Due", "Status"],
          [["[Action]", "[Owner]", "[Date]", "Open"]],
        ),
    },
    {
      id: "business-report",
      name: "Business report",
      description: "Executive summary, findings, evidence and recommendations.",
      tags: ["report", "analysis"],
      html:
        "<h1>Business report</h1><p>[Title, author and reporting period]</p><h2>Executive summary</h2><p>[Summarize the key result and recommended action.]</p><h2>Context and method</h2><p>[Purpose, scope and method.]</p><h2>Findings and evidence</h2>" +
        rows(
          ["Finding", "Evidence / reference", "Limitations"],
          [["[Finding]", "[Source]", "[Uncertainty]"]],
        ) +
        "<h2>Recommendations</h2><ol><li>[Recommendation, owner and next step]</li></ol><h2>References</h2><p>[Verified references only.]</p>",
    },
    {
      id: "proposal",
      name: "Proposal",
      description: "Problem, solution, alternatives, delivery and approval.",
      tags: ["proposal", "commercial"],
      html:
        "<h1>Proposal</h1><p><strong>Prepared for:</strong> [Audience] · <strong>Prepared by:</strong> [Author]</p><h2>The need</h2><p>[Describe the requested outcome.]</p><h2>Proposed approach</h2><p>[Explain the approach and alternatives.]</p><h2>Delivery plan</h2>" +
        rows(
          ["Phase", "Deliverable", "Estimate"],
          [["[Phase]", "[Deliverable]", "[Estimate, not a commitment]"]],
        ) +
        "<h2>Assumptions and exclusions</h2><ul><li>[Assumption]</li></ul><h2>Approval</h2><p>[Decision owner and next step.]</p>",
    },
    {
      id: "decision-record",
      name: "Decision record",
      description: "A traceable context/options/decision/consequences record.",
      tags: ["decision", "architecture"],
      html:
        "<h1>Decision record</h1><p><strong>Status:</strong> Proposed · <strong>Date:</strong> [Date] · <strong>Owner:</strong> [Owner]</p><h2>Context</h2><p>[Constraints and decision drivers.]</p><h2>Options considered</h2>" +
        rows(
          ["Option", "Benefits", "Tradeoffs"],
          [
            ["[Option A]", "[Benefits]", "[Tradeoffs]"],
            ["[Option B]", "[Benefits]", "[Tradeoffs]"],
          ],
        ) +
        "<h2>Decision</h2><p>[Decision and supporting rationale.]</p><h2>Consequences and follow-up</h2><p>[Consequences, checks and review date.]</p>",
    },
    {
      id: "business-letter",
      name: "Business letter",
      description: "A simple, editable letter with subject and closing.",
      tags: ["letter", "correspondence"],
      html: "<p>[Sender name]<br>[Sender address]<br>[Date]</p><p>[Recipient name]<br>[Recipient address]</p><h1>[Subject]</h1><p>Dear [Recipient],</p><p>[State the purpose of this letter.]</p><p>[Provide relevant details and the requested next step.]</p><p>Kind regards,<br>[Name]<br>[Role / contact details]</p>",
    },
    {
      id: "resume",
      name: "Professional résumé",
      description:
        "Profile, experience, skills and education without invented credentials.",
      tags: ["resume", "career"],
      html: "<h1>[Your name]</h1><p>[Professional title] · [Contact details]</p><h2>Profile</h2><p>[A concise, factual professional summary.]</p><h2>Experience</h2><h3>[Role] · [Organization]</h3><p>[Dates]</p><ul><li>[Verified responsibility or achievement]</li></ul><h2>Skills</h2><p>[Relevant skills and supporting experience.]</p><h2>Education and qualifications</h2><p>[Verified qualification, institution and date.]</p>",
    },
    {
      id: "procedure",
      name: "Standard operating procedure",
      description: "Purpose, prerequisites, ordered steps and verification.",
      tags: ["procedure", "operations"],
      html: "<h1>Standard operating procedure</h1><p><strong>Owner:</strong> [Owner] · <strong>Version:</strong> [Version] · <strong>Review date:</strong> [Date]</p><h2>Purpose and scope</h2><p>[When to use this procedure.]</p><h2>Prerequisites</h2><ul><li>[Required input, access or equipment]</li></ul><h2>Procedure</h2><ol><li>[Step and expected result]</li><li>[Next step and expected result]</li></ol><h2>Verification</h2><p>[How the result is checked.]</p><h2>Exceptions and recovery</h2><p>[When to stop and how to recover.]</p>",
    },
  ];
  const layouts = [
    {
      id: "professional",
      name: "Professional report",
      description:
        "Arial body text, restrained blue headings and clear tables.",
      properties: {
        fontFamily: "Arial",
        fontSize: 16,
        lineHeight: 1.6,
        accent: "#245782",
        textColor: "#253249",
        headerFill: "#e9f0f8",
        headerText: "#253249",
        bandFill: "#f5f8fc",
      },
    },
    {
      id: "editorial",
      name: "Editorial reading",
      description:
        "Georgia body text with generous leading and burgundy accents.",
      properties: {
        fontFamily: "Georgia",
        fontSize: 18,
        lineHeight: 1.8,
        accent: "#783344",
        textColor: "#343039",
        headerFill: "#f4e9ed",
        headerText: "#343039",
        bandFill: "#fcf7f9",
      },
    },
    {
      id: "compact",
      name: "Compact notes",
      description:
        "Compact Arial typography for agendas, minutes and operational notes.",
      properties: {
        fontFamily: "Arial",
        fontSize: 14,
        lineHeight: 1.4,
        accent: "#3d6655",
        textColor: "#273b33",
        headerFill: "#e6f0e9",
        headerText: "#273b33",
        bandFill: "#f4f8f5",
      },
    },
  ];
  const api = {
    templates,
    layouts,
    create: (id) => {
      const t = templates.find((t) => t.id === id);
      if (!t) throw Error("Unknown document template.");
      return { name: t.name, html: t.html };
    },
  };
  root.TextixCatalogue = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
