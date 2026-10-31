const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path"),
  C = require("./prompt-library-core");
const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../shared-suite/apps.js"), "utf8"),
  context,
);
const apps = context.window.SuiteApps;
assert.equal(apps.length, 18);
for (const app of apps) {
  const recipes = C.starters(app.id);
  assert.equal(recipes.length, 3, app.id);
  assert.equal(new Set(recipes.map((r) => r.id)).size, 3);
  for (const r of recipes) {
    for (const field of [
      "id",
      "title",
      "goal",
      "scope",
      "constraints",
      "acceptance",
      "mode",
    ])
      assert.ok(
        typeof r[field] === "string" && r[field].length,
        app.id + " " + field,
      );
    const prompt = C.brief(app.id, r, app.id === "codeiX");
    assert.ok(prompt.includes(r.acceptance));
    assert.ok(prompt.includes(r.constraints));
    assert.ok(prompt.includes(app.id));
  }
  recipes[0].goal = "mutated";
  assert.notEqual(C.starters(app.id)[0].goal, "mutated");
}
assert.equal(C.starters("shelliX")[0].mode, "plan");
assert.ok(
  C.brief("mockiX", C.starters("mockiX")[0]).includes("reusable definitions"),
);
assert.deepEqual(C.starters("__proto__"), []);
assert.equal(C.starters("sketchiX shape editor").length, 3);
console.log(
  "PASS: three actionable native starting points for each of 18 apps, explicit success criteria, immutable recipes, shell planning default and mockiX design/flow guidance.",
);
