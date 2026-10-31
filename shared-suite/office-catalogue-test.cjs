const assert = require("node:assert/strict"),
  T = require("../textiX/catalogue"),
  S = require("../sheetiX/catalogue"),
  C = require("./office-catalogue"),
  F = require("../sheetiX/formulas");
assert.equal(T.templates.length, 8);
assert.equal(S.templates.length, 8);
for (const [tool, catalog] of [
  ["textiX", T],
  ["sheetiX", S],
]) {
  assert.equal(catalog.layouts.length, 3);
  for (const l of catalog.layouts)
    assert.deepEqual(
      C.layout(tool, {
        format: "suite-office-layout/v1",
        tool,
        properties: l.properties,
      }).properties,
      l.properties,
    );
  for (const t of catalog.templates) {
    const d = catalog.create(t.id),
      before = JSON.stringify(d);
    if (tool === "textiX") {
      assert.match(d.html, /<h1>/);
      d.html = "mutated";
      assert.notEqual(catalog.create(t.id).html, d.html);
    } else {
      const calc = F.evaluator(d);
      for (const sheet of d.sheets)
        for (const [address, cell] of Object.entries(sheet.cells))
          if (cell.value.startsWith("=")) {
            const result = calc.result(sheet, address);
            assert.equal(
              !!result.error,
              false,
              t.id + " " + address + " " + result.value,
            );
          }
      C.applyLayout(tool, d, catalog.layouts[0].properties);
      assert.equal(JSON.stringify(d), before);
    }
  }
}
const incoming = S.create("budget"),
  current = S.create("budget");
current.name = "Keep my workbook";
current.sheets[0].cells.C2.value = "100000";
const before = JSON.stringify(current),
  extended = C.extend("sheetiX", current, incoming);
assert.equal(JSON.stringify(current), before);
assert.equal(extended.name, "Keep my workbook");
assert.deepEqual(
  extended.sheets.map((s) => s.name),
  ["Budget", "Summary", "Budget 2", "Summary 2"],
);
const calc = F.evaluator(extended);
assert.equal(calc.get(extended.sheets[1], "B3"), 97510);
assert.equal(calc.get(extended.sheets[3], "B3"), 2310);
assert.equal(new Set(extended.sheets.map((s) => s.id)).size, 4);
const names = new Map([["budget", "Budget 2"]]);
assert.equal(
  C.rewrite('="Budget!C8"&Budget!$C$8', names),
  "=\"Budget!C8\"&'Budget 2'!$C$8",
);
assert.equal(C.rewrite("'=Budget!C8", names), "'=Budget!C8");
assert.equal(C.rewrite("=Other!A1+1", names), "=Other!A1+1");
const duplicate = S.create("budget");
duplicate.sheets[1].name = duplicate.sheets[0].name;
assert.throws(() => C.extend("sheetiX", current, duplicate), /duplicate sheet/);
const max = {
  name: "Full",
  sheets: Array.from({ length: 20 }, (_, i) => ({
    id: "s" + i,
    name: "Sheet" + i,
    rows: 30,
    cols: 8,
    cells: {},
  })),
};
assert.throws(() => C.extend("sheetiX", max, incoming), /20-sheet/);
const styled = C.applyLayout("sheetiX", incoming, S.layouts[1].properties);
for (let i = 0; i < incoming.sheets.length; i++)
  for (const [address, cell] of Object.entries(incoming.sheets[i].cells)) {
    assert.equal(styled.sheets[i].cells[address].value, cell.value);
    assert.equal(
      styled.sheets[i].cells[address].style.numberFormat,
      cell.style.numberFormat,
    );
  }
assert.throws(
  () =>
    C.layout("textiX", {
      format: "suite-office-layout/v1",
      tool: "sheetiX",
      properties: S.layouts[0].properties,
    }),
  /textiX/,
);
assert.throws(
  () =>
    C.layout("textiX", {
      format: "suite-office-layout/v1",
      tool: "textiX",
      properties: { ...T.layouts[0].properties, accent: "url(evil)" },
    }),
  /hex/,
);
assert.throws(
  () =>
    C.layout("textiX", {
      format: "suite-office-layout/v1",
      tool: "textiX",
      properties: { ...T.layouts[0].properties, fontSize: 99 },
    }),
  /supported/,
);
console.log(
  "PASS: 16 native templates, six editable layouts, calculated formulas, collision-safe workbook extension, literal-safe reference rewriting, sheet limits and nonmutating style application.",
);
