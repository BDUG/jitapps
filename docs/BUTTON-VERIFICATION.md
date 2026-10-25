# Button verification

Run the suite server, then run:

```sh
node scripts/verify-suite.cjs --browser --base-url http://127.0.0.1:8000 --report /tmp/suite-checks.json
```

The gate includes each app's core browser workflow plus shared control checks on
all 13 apps and both sketchiX artwork editors. Core checks exercise document
editing, history, imports/exports, reviewed AI application and mobile controls
where applicable. Shared checks click Workspace tabs, Virtual disk open/close,
Chat/Coding agent tabs, and every Agent tools tab. They verify expected visible
panels and check for browser exceptions. Workspace and disk navigation are also
checked at a 390-pixel viewport.

The shared control audit flags initially visible enabled buttons without a
registered click, keyboard or pointer handler (including ancestor delegation).
This catches missing wiring; behavioral assertions in the app tests verify
actual outcomes. A registered handler alone does not prove correct behavior.

The Architex architecture rail button now focuses the graph canvas. Tests use
BASE_URL rather than assuming a particular local server. AI proposal tests click
Review proposed edit by name instead of accidentally matching Copy answer.
Presentation tests generate their independent PPTX fixture before import; the
Project XML test uses a checked-in hand-authored MSPDI fixture independent of
the app exporter, without a dependency on an untracked temporary file or Java.

Additional focused checks:

```sh
BASE_URL=http://127.0.0.1:8000 node shared-suite/browser-test.cjs
BASE_URL=http://127.0.0.1:8000 node shared-ai/relay-paging-browser-test.cjs
```

These exercise desktop search/icons, native imports and virtual-disk exports
across apps, folder transfers, and relay paging settings save/validation/reload.

Coverage is regression testing of the listed workflows, not proof of every
button in every possible document state. AI fixtures exercise request/review/UI
behavior without relying on paid providers. Live provider availability, cloud
account operations, OS file-picker internals, and printer dialogs require their
respective configured environments.

The shared control check also exercises Tool actions search/no-match/reset,
new-conversation clearing, schema downloads, and invalid/valid relay URL saving
on each shared-chat editor. The native codeiX chat follows its own core test.
The agent browser check downloads and validates the working brief after a real
failed-check/fix/reverification sequence.
