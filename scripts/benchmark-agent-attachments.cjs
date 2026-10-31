const assert = require("node:assert/strict"),
  path = require("node:path"),
  { performance } = require("node:perf_hooks");
if (!process.argv[2])
  throw Error(
    "Usage: node --expose-gc scripts/benchmark-agent-attachments.cjs /path/to/baseline.cjs",
  );
const before = require(path.resolve(process.argv[2])),
  after = require("../shared-ai/multimodal.js");
const payload = 'Original source with unicode 🧪 and "quotes"\n'.repeat(5000),
  image = "data:image/png;base64," + "YWJj".repeat(50000),
  events = Array.from({ length: 60 }, () => ({
    kind: "user",
    value: {
      status: "follow_up",
      attachments: [
        { name: "source.md", kind: "text", content: payload },
        {
          name: "image.png",
          kind: "image",
          dataUrl: image,
          caption: "reference",
        },
      ],
    },
  }));
const items = Array.from({ length: 3000 }, (_, i) =>
  i % 3 === 0
    ? { name: i + ".md", kind: "text", content: "source" }
    : {
        name: i + ".png",
        kind: "image",
        dataUrl: "data:image/png;base64,YQ==",
        bytes: 1,
      },
);
function measure(fn, arg) {
  for (let i = 0; i < 3; i++) fn(arg);
  const samples = [];
  for (let i = 0; i < 9; i++) {
    global.gc?.();
    const start = performance.now();
    fn(arg);
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[4];
}
for (const [name, arg] of [
  ["references", events],
  ["descriptors", items],
]) {
  assert.deepEqual(after[name](arg), before[name](arg));
  const old = measure(before[name], arg),
    current = measure(after[name], arg);
  console.log(
    JSON.stringify({
      operation: name,
      items: arg.length,
      beforeMs: old,
      afterMs: current,
      speedup: old / current,
      scope: "Attachment preparation only; excludes inference/network/tools.",
    }),
  );
}
let seed = 23;
const rand = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (let i = 0; i < 200; i++) {
  const attachments = Array.from({ length: 40 }, (_, j) => {
    const file = {
      name: ["same.md", "same.png", "same/name.png", "same_name.png"][
        Math.floor(rand() * 4)
      ],
      kind: rand() > 0.5 ? "text" : "image",
      caption: [undefined, null, "view", "🧪", NaN, { a: 1 }][
        Math.floor(rand() * 6)
      ],
    };
    if (rand() > 0.5)
      file.content = ["same", "new", '🧪\n"'][Math.floor(rand() * 3)];
    else
      file.dataUrl =
        "data:image/png;base64," + ["YQ==", "Yg=="][Math.floor(rand() * 2)];
    return file;
  });
  const history = [
    { kind: "user", value: { status: "follow_up", attachments } },
    {
      kind: "user",
      value: {
        status: "reference_files",
        attachments: attachments.slice().reverse(),
      },
    },
  ];
  assert.deepEqual(after.references(history), before.references(history));
  assert.deepEqual(after.fromEvents(history), before.fromEvents(history));
  assert.deepEqual(
    after.descriptors(attachments),
    before.descriptors(attachments),
  );
}
console.log(
  "PASS: exact baseline equality across 600 mixed attachment operations.",
);
