---
name: verification
description: Verify coding changes with deterministic tests, browser UI flows, security scans and spec review.
---
Use the repository's configured checks and actual host tool callbacks. Frontend changes require a sandboxed browser flow. Security checks must cover configured SAST, dependency, IaC and secrets scopes. Reviewer and SecurityAuditor findings must refer to current source. A green receipt becomes stale after source changes. Ask for help when requirements conflict or repeated checks fail.
