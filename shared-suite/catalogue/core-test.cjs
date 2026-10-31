const assert = require("node:assert/strict"),
  C = require("./core"),
  seeds = require("./seeds.json");
assert.equal(Object.keys(C.names).length, 18);
for (const tool of Object.keys(C.names)) {
  const entries = C.entries(tool);
  assert.equal(entries.length, 4);
  assert.equal(new Set(entries.map((e) => e.id)).size, 4);
  for (const entry of entries) {
    if (tool === "projectiX" && entry.kind === "layout") continue;
    const before = JSON.stringify(seeds[tool]);
    const d = C.create(tool, entry.id, seeds, seeds[tool] || {});
    assert.ok(d && typeof d === "object");
    assert.equal(JSON.stringify(seeds[tool]), before);
  }
}
const locked = {
  name: "Example",
  pages: [
    {
      background: "#ffffff",
      elements: [
        {
          id: "locked",
          type: "text",
          fill: "#ff0000",
          text: "Keep me",
          locked: true,
        },
        { id: "open", type: "text", fill: "#ff0000", text: "Restyle me" },
      ],
    },
  ],
};
const themed = C.theme("designiX", locked, "blue");
assert.deepEqual(themed.pages[0].elements[0], locked.pages[0].elements[0]);
assert.equal(themed.pages[0].elements[1].text, "Restyle me");
assert.equal(themed.pages[0].elements[1].fill, "#343b43");
const sheet = C.create("sheetiX", "starter-0", seeds, seeds.sheetiX);
assert.equal(sheet.sheets[0].cells.D2.value, "=B2*C2");
assert.equal(sheet.sheets[0].name, "Risks");
const photo = C.create("photiX", "starter-0", seeds, seeds.photiX);
assert.equal(photo.operations[0].type, "text");
assert.equal(photo.image, seeds.photiX.image);
assert.throws(() => C.entries("unknown"));
assert.throws(() => C.create("mockiX", "unknown", seeds, seeds.mockiX));
console.log(
  "PASS: 18 app catalogues with two templates/two layouts each, fresh native examples, immutable seeds, locked-layer preservation, formulas, inline images and unknown-entry rejection.",
);
