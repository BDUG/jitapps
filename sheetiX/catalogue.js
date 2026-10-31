/* Formula-bearing workbook starting points. Values are editable illustrative examples. */
(function (root) {
  "use strict";
  const copy = (v) => JSON.parse(JSON.stringify(v)),
    templates = [];
  function sheet(name, headers, rows, formats = {}) {
    const cells = {},
      set = (r, c, value) => {
        const address = String.fromCharCode(65 + c) + (r + 1),
          style = {
            ...(r === 0
              ? { bold: true, background: "#e7edf8", textColor: "#253249" }
              : r % 2
                ? { background: "#f7f9fc" }
                : {}),
            ...(formats[c] && r > 0 ? { numberFormat: formats[c] } : {}),
          };
        cells[address] = { value: String(value), style };
      };
    headers.forEach((v, c) => set(0, c, v));
    rows.forEach((row, r) => row.forEach((v, c) => set(r + 1, c, v)));
    return {
      id: "template-" + name.toLowerCase().replaceAll(" ", "-"),
      name,
      rows: Math.max(30, rows.length + 6),
      cols: Math.max(8, headers.length),
      cells,
    };
  }
  function add(id, name, description, tags, sheets) {
    templates.push({ id, name, description, tags, document: { name, sheets } });
  }
  add(
    "budget",
    "Budget planner",
    "Plan and actual amounts, category variances and a linked summary.",
    ["budget", "finance"],
    [
      sheet(
        "Budget",
        ["Category", "Planned", "Actual", "Variance"],
        [
          ["Income", 5000, 4800, "=C2-B2"],
          ["Housing", 1500, 1500, "=C3-B3"],
          ["Food", 500, 560, "=C4-B4"],
          ["Transport", 200, 180, "=C5-B5"],
          ["Other", 300, 250, "=C6-B6"],
          ["Expenses", "=SUM(B3:B6)", "=SUM(C3:C6)", "=C7-B7"],
          ["Balance", "=B2-B7", "=C2-C7", "=C8-B8"],
        ],
        { 1: "currency", 2: "currency", 3: "currency" },
      ),
      sheet(
        "Summary",
        ["Metric", "Amount"],
        [
          ["Planned balance", "='Budget'!B8"],
          ["Actual balance", "='Budget'!C8"],
        ],
        { 1: "currency" },
      ),
    ],
  );
  add(
    "expense-log",
    "Expense log",
    "Track dated expenses and an editable total.",
    ["expenses", "finance"],
    [
      sheet(
        "Expenses",
        ["Date", "Category", "Description", "Amount"],
        [
          ["2026-01-01", "Travel", "Example expense", 25],
          ["2026-01-02", "Supplies", "Example expense", 40],
          ["", "", "", 0],
          ["Total", "", "", "=SUM(D2:D4)"],
        ],
        { 3: "currency" },
      ),
    ],
  );
  add(
    "invoice",
    "Invoice worksheet",
    "Line items, tax rate and calculated totals; replace the examples.",
    ["invoice", "finance"],
    [
      sheet(
        "Invoice",
        ["Item", "Quantity", "Unit price", "Line total"],
        [
          ["Example service", 2, 150, "=B2*C2"],
          ["Example material", 3, 20, "=B3*C3"],
          ["Subtotal", "", "", "=SUM(D2:D3)"],
          ["Tax rate", 0.19, "", ""],
          ["Tax", "", "", "=D4*B5"],
          ["Total", "", "", "=D4+D6"],
        ],
        { 2: "currency", 3: "currency" },
      ),
    ],
  );
  add(
    "project-tracker",
    "Project tracker",
    "Tasks, owners, status, dates and completion values.",
    ["projects", "tasks"],
    [
      sheet(
        "Tasks",
        ["Task", "Owner", "Status", "Due date", "Completion"],
        [
          ["Define requirements", "Owner", "In progress", "YYYY-MM-DD", 0.5],
          ["Build first version", "Owner", "Not started", "YYYY-MM-DD", 0],
          ["Review result", "Owner", "Not started", "YYYY-MM-DD", 0],
          ["Average completion", "", "", "", "=AVERAGE(E2:E4)"],
        ],
        { 4: "percent" },
      ),
    ],
  );
  add(
    "sales-summary",
    "Sales summary",
    "Editable monthly units, prices and revenue formulas.",
    ["sales", "dashboard"],
    [
      sheet(
        "Sales",
        ["Month", "Units", "Unit price", "Revenue"],
        [
          ["January", 10, 50, "=B2*C2"],
          ["February", 12, 50, "=B3*C3"],
          ["March", 15, 50, "=B4*C4"],
          ["Total", "=SUM(B2:B4)", "", "=SUM(D2:D4)"],
        ],
        { 2: "currency", 3: "currency" },
      ),
    ],
  );
  add(
    "inventory",
    "Inventory planner",
    "Stock counts, reorder levels and supported IF formulas.",
    ["inventory", "operations"],
    [
      sheet(
        "Inventory",
        ["Item", "On hand", "Reorder level", "Action"],
        [
          ["Item A", 12, 5, '=IF(B2<C2,"Reorder","OK")'],
          ["Item B", 3, 5, '=IF(B3<C3,"Reorder","OK")'],
          ["Item C", 0, 2, '=IF(B4<C4,"Reorder","OK")'],
        ],
        { 1: "integer", 2: "integer" },
      ),
    ],
  );
  add(
    "gradebook",
    "Weighted gradebook",
    "Illustrative scores with explicit weights and weighted results.",
    ["education", "scores"],
    [
      sheet(
        "Scores",
        [
          "Name",
          "Assignment",
          "Exam",
          "Assignment weight",
          "Exam weight",
          "Weighted score",
        ],
        [
          ["Learner A", 80, 90, 0.4, 0.6, "=B2*D2+C2*E2"],
          ["Learner B", 75, 85, 0.4, 0.6, "=B3*D3+C3*E3"],
          [
            "Average",
            "=AVERAGE(B2:B3)",
            "=AVERAGE(C2:C3)",
            "",
            "",
            "=AVERAGE(F2:F3)",
          ],
        ],
        { 3: "percent", 4: "percent", 5: "decimal" },
      ),
    ],
  );
  add(
    "comparison",
    "Decision comparison",
    "Criteria, weights, option scores and a weighted total.",
    ["comparison", "decisions"],
    [
      sheet(
        "Comparison",
        [
          "Criterion",
          "Weight",
          "Option A",
          "Option B",
          "A weighted",
          "B weighted",
        ],
        [
          ["Fit", 0.5, 4, 3, "=B2*C2", "=B2*D2"],
          ["Cost", 0.3, 3, 4, "=B3*C3", "=B3*D3"],
          ["Effort", 0.2, 4, 2, "=B4*C4", "=B4*D4"],
          [
            "Weighted total",
            "=SUM(B2:B4)",
            "",
            "",
            "=SUM(E2:E4)",
            "=SUM(F2:F4)",
          ],
        ],
        { 1: "percent", 4: "decimal", 5: "decimal" },
      ),
    ],
  );
  templates.find(
    (t) => t.id === "invoice",
  ).document.sheets[0].cells.B5.style.numberFormat = "percent";
  const layouts = [
    {
      id: "professional",
      name: "Professional table",
      description:
        "Blue header and alternating cool bands; retain values and number formats.",
      properties: {
        accent: "#315b8a",
        textColor: "#253249",
        headerFill: "#315b8a",
        headerText: "#ffffff",
        bandFill: "#edf3fa",
      },
    },
    {
      id: "financial",
      name: "Financial table",
      description:
        "Green header and soft bands; existing currencies and formulas remain unchanged.",
      properties: {
        accent: "#356b52",
        textColor: "#253b30",
        headerFill: "#356b52",
        headerText: "#ffffff",
        bandFill: "#edf6ef",
      },
    },
    {
      id: "contrast",
      name: "High-contrast table",
      description:
        "Dark header and light bands with clear text, without changing data.",
      properties: {
        accent: "#253249",
        textColor: "#17202f",
        headerFill: "#253249",
        headerText: "#ffffff",
        bandFill: "#f0f1f4",
      },
    },
  ];
  const api = {
    templates,
    layouts,
    create: (id) => {
      const t = templates.find((t) => t.id === id);
      if (!t) throw Error("Unknown workbook template.");
      return copy(t.document);
    },
  };
  root.SheetixCatalogue = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
