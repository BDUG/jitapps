const assert = require("node:assert/strict"),
  M = require("./multimodal.js");
const image = {
    name: "same/name.png",
    kind: "image",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64," + "YQ==".repeat(10000),
    caption: "Inspect this 🧪",
    detail: "high",
  },
  text = {
    name: "spec.md",
    kind: "text",
    content: "Preserve this exact source 🧪\n".repeat(5000),
  };
const events = Array.from({ length: 60 }, () => ({
  kind: "user",
  value: { status: "follow_up", attachments: [{ ...text }, { ...image }] },
}));
const stringify = JSON.stringify;
let serialized = 0;
JSON.stringify = (...args) => {
  serialized++;
  return stringify(...args);
};
let refs;
try {
  refs = M.references(events);
} finally {
  JSON.stringify = stringify;
}
assert.equal(
  serialized,
  0,
  "Ordinary reference deduplication must not serialize entire attachment payloads",
);
assert.equal(refs.length, 2);
assert.equal(refs[0].content, text.content);
assert.equal(refs[1].dataUrl, image.dataUrl);
assert.equal(M.fromEvents(events).length, 1);
const versions = M.references([
  {
    kind: "user",
    value: {
      status: "reference_files",
      attachments: [
        image,
        { ...image, dataUrl: image.dataUrl + "AAAA" },
        { ...image, caption: "Other view" },
        image,
        { ...text, name: "same_name.png" },
      ],
    },
  },
]);
assert.equal(versions.length, 4);
assert.equal(new Set(versions.map((f) => f.name)).size, 4);
assert.equal(versions[0].caption, image.caption);
// Legacy optional fields retain the old JSON equality, including NaN/null collisions.
const unusual = M.references([
  {
    kind: "user",
    value: {
      status: "reference_files",
      attachments: [
        { ...text, caption: null },
        { ...text, caption: NaN },
        { ...text, caption: { a: 1 } },
        { ...text, caption: { a: 1 } },
        { ...text, caption: '{"a":1}' },
      ],
    },
  },
]);
assert.equal(unusual.length, 3);
const sparse = [];
sparse[1] = text;
sparse[3] = image;
sparse[4] = { ...text, dataUrl: "historical hybrid" };
sparse[7] = { ...image, name: "other.png" };
const descriptors = M.descriptors(sparse);
assert.equal(0 in descriptors, false);
assert.equal(descriptors[3].mediaPart, 1);
assert.equal(descriptors[7].mediaPart, 3);
assert.equal(descriptors[1].content, text.content);
assert.ok(!("dataUrl" in descriptors[3]));
const mutable = { ...text },
  source = [
    { kind: "user", value: { status: "follow_up", attachments: [mutable] } },
  ];
assert.equal(M.references(source)[0].content, text.content);
mutable.content = "Updated source";
assert.equal(M.references(source)[0].content, "Updated source");
console.log(
  "PASS: payload-free exact deduplication, changed snapshots/captions, filename collisions, legacy equality, sparse mixed attachment numbering, unchanged source and per-call freshness.",
);
