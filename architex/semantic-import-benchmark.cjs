/* Repeatable local policy-check microbenchmark; not provider or end-to-end import latency. */
const I = require("./semantic-import.js");
const components = Array.from({ length: 8000 }, (_, i) => ({
  id: "c" + i,
  name: "Component " + i,
  description: "Existing component",
  category: "",
  color: "#8b1e3f",
  parentId: null,
  x: (i % 20) * 200,
  y: Math.floor(i / 20) * 160,
  ports: [],
  parameters: { runtime: "node" },
}));
const before = {
    metamodel: { name: "Large model", components, dependencies: [] },
    instanceModel: { instances: [], connections: [] },
    ruleLibrary: { rules: [] },
  },
  after = structuredClone(before);
for (const strategy of ["merge", "add"]) {
  const times = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    I.validatePolicy(before, after, { strategy });
    times.push(Math.round(performance.now() - start));
  }
  console.log(
    JSON.stringify({
      nodes: components.length,
      strategy,
      timesMs: times,
      medianMs: [...times].sort((a, b) => a - b)[1],
    }),
  );
}
