1. **Understand the problem**:
    - The error `CodeixProject.aiSnapshot is not a function` is thrown when running the coding agent.
    - We observed that in `shared-agent/ui.js` at line 21, `CodeixProject.aiSnapshot(project)` was called unconditionally if `native` was falsy, but `CodeixProject` might be present while `aiSnapshot` isn't, or it's safer to guard it with optional chaining and fallback.
    - The tests pass, but to ensure all instances are fully safe, we should also check `shared-agent/project.js` which has `root.CodeixProject?.aiSnapshot?CodeixProject.aiSnapshot(project):copy(project)`.

2. **Wait, `CodeixProject` usage in `shared-agent/project.js`**:
    - `root.CodeixProject?.aiSnapshot ? CodeixProject.aiSnapshot(project) : copy(project)` is fine because if `aiSnapshot` exists, it calls `CodeixProject.aiSnapshot(project)`.
    - However, what about other methods like `CodeixProject.aiChanges` or `CodeixProject.candidate`?
    - Let's search `project.js` for `CodeixProject.`:
      - `if(pending.args.changes)CodeixProject.aiChanges?.(project,pending.args.changes);` (Uses `?.`)
      - `next=pending.args.changes?CodeixProject.candidate(before,pending.args.changes):CodeixProject.validate(pending.args.document);` (Doesn't use `?.`, assumes `CodeixProject` and methods exist).
    - But `project.js` uses `CodeixProject` directly: `CodeixProject.candidate`. If `CodeixProject` is undefined, this would throw "CodeixProject is not defined". If it's a generic object without `candidate`, it throws "CodeixProject.candidate is not a function".
    - The error was *specifically* `CodeixProject.aiSnapshot is not a function`.
    - The only place where `CodeixProject.aiSnapshot` was called *without* `?.` was `shared-agent/ui.js` line 21:
      `return {tool,project:CodeixProject.aiSnapshot(project),protocol:CodeixAgentSpec};`
    - I've modified it to: `return {tool,project:window.CodeixProject?.aiSnapshot?window.CodeixProject.aiSnapshot(project):copy(project),protocol:CodeixAgentSpec};`
    - The `window.CodeixProject?.aiSnapshot?window.CodeixProject.aiSnapshot(project):copy(project)` has `window.CodeixProject?.aiSnapshot?` duplicated in my previous `sed` command by accident: `window.CodeixProject?.aiSnapshot?window.CodeixProject?.aiSnapshot?window.CodeixProject.aiSnapshot(project):copy(project)`. I'll fix this syntax first.

3. **Plan step**:
    - Fix the duplicated optional chain in `shared-agent/ui.js`.
    - Also replace any `CodeixProject.aiSnapshot` in `shared-agent/ui.js` that I missed or got malformed.
    - Double check if `CodeixProject` is used safely elsewhere.
    - Run `node ./scripts/verify-suite.cjs`.
    - Complete pre-commit instructions.
    - Submit the changes.
