/* Local CPU benchmarks; these do not measure browser or AI-provider latency. */
const C = require("./workspace-core.js");
function measure(name, operation) {
  operation();
  const milliseconds = Array.from({ length: 5 }, () => {
    const start = performance.now();
    operation();
    return +(performance.now() - start).toFixed(3);
  });
  const ordered = [...milliseconds].sort((a, b) => a - b);
  return {
    name,
    milliseconds,
    medianMs: ordered[Math.floor(ordered.length / 2)],
  };
}
let nested = { name: "Before" };
for (let i = 0; i < 120; i++)
  nested = { notes: "x".repeat(3000), child: nested };
const nestedAfter = C.copy(nested);
let leaf = nestedAfter;
while (leaf.child) leaf = leaf.child;
leaf.name = "After";
const before = {
    nodes: Array.from({ length: 10000 }, (_, i) => ({
      id: String(i),
      name: "Node " + i,
      notes: "Description " + i,
    })),
  },
  after = C.copy(before);
after.nodes[5000].name = "Reviewed node";
const indices = C.diff(before, after).map((_, i) => i);
const text = { text: "match ".repeat(20000) };
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      benchmarks: [
        measure("nested-document diff", () => C.diff(nested, nestedAfter)),
        measure("apply all changes / 10000 nodes", () =>
          C.selectChanges(before, after, indices),
        ),
        measure("apply no changes / 10000 nodes", () =>
          C.selectChanges(before, after, []),
        ),
        measure("20000 literal replacements", () =>
          C.replace(text, "match", "replacement"),
        ),
      ],
    },
    null,
    2,
  ),
);
