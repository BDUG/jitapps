# Worked example: edit an SVG and follow every message

[Back to the Coding Agent How-to Book](README.md)

This walkthrough changes a red rectangle to blue in a **workspace SVG file**.
It uses the Python coding API, whose real file tools also back JavaScript
`LocalRuntime`. This edits source on disk; an open graphical editor requires its
own project bridge or a later import of the changed SVG.

## Goal and original file

User → host:

> Change badge.svg rectangle fill from #ef4444 to #2563eb; preserve geometry and verify SVG XML.

The temporary workspace initially contains `badge.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <rect id="badge" x="10" y="10" width="100" height="40" fill="#ef4444"/>
</svg>
```

The host constructs `Agent(workspace, commands=[sys.executable])` and runs with
`allow_edits=True, allow_commands=True`. This authorizes file edits and the selected
Python interpreter. Those permissions come from the host, not from the LLM.

The transcript below comes from the runnable example. Session IDs are normalized
to `svg_demo`; tool definitions, instructions, schema bodies, earlier history and
large receipt metadata are shortened where explicitly noted. File hashes are real
hashes of the fixture bytes. Always pass the complete request produced by the API.

## Use the Python coding-agent SDK in your application

Install the package from the repository root into your Python environment:

```sh
python3 -m pip install -e ./codingagentlib
```

Use `from codingagentlib import Agent` for this workspace-editing walkthrough.
`create_agent` is the separate generic host-tool SDK; it does not automatically
provide these guarded file and command tools.

The following application edits an **existing** `badge.svg` in the directory
passed on the command line. It connects the coding SDK to the bundled compatible
chat adapter, records the exact model payloads, and handles the terminal result.
Save it as `edit_svg.py`:

```python
import copy
import json
import os
from pathlib import Path
import sys
import urllib.request

from codingagentlib import Agent
from codingagentlib.python.providers import openai_model

workspace = Path(sys.argv[1]).expanduser().resolve(strict=True)
if not workspace.is_dir() or not (workspace / 'badge.svg').is_file():
    raise SystemExit('Pass an existing workspace containing badge.svg')


def post_json(endpoint, body, headers):
    # The adapter constructs the provider envelope; this host function owns HTTP.
    request = urllib.request.Request(
        endpoint, data=json.dumps(body).encode('utf-8'),
        headers=headers, method='POST')
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


provider_model = openai_model(
    endpoint=os.environ['AGENT_CHAT_ENDPOINT'],
    model_id=os.environ['AGENT_MODEL'],
    api_key=os.environ.get('AGENT_API_KEY', ''),
    request=post_json)
exchanges = []


def model(request):
    # request is the complete SDK payload illustrated in Messages 1–4 below.
    # The adapter returns choices[0].message.content as JSON text.
    exchange = {'request': copy.deepcopy(request)}
    exchanges.append(exchange)
    reply = provider_model(request)
    exchange['response'] = reply
    return reply  # Agent validates and executes the requested action.


def on_event(event):
    # Coding API progress results: continue/retry/waiting/complete, etc.
    # Keep diagnostics on stderr, separate from the final JSON on stdout.
    print(event['status'], file=sys.stderr)


with Agent(str(workspace), commands=[sys.executable]) as agent:
    result = agent.run(
        'Change badge.svg rectangle fill from #ef4444 to #2563eb; '
        'preserve all other source and geometry. Read the current file first, '
        f'edit with its actual hash, then use {sys.executable} to parse the SVG '
        'as XML and assert the blue fill and original geometry. '
        'Report exactly what was verified; no visual rendering check is requested.',
        model,
        allow_edits=True,
        allow_commands=True,
        max_steps=12,
        on_event=on_event)
    # Full recorded observations include command receipts and verification data.
    session = agent.dispatch({'op': 'session', 'session': result['sessionId']})

print(json.dumps({'result': result, 'exchanges': exchanges,
                  'events': session['events']}, indent=2))
if result['status'] == 'complete' and result.get('outcome') == 'complete':
    print('Edited SVG: ' + str(workspace / 'badge.svg'), file=sys.stderr)
elif result['status'] == 'waiting':
    print('Input needed: ' + result.get('question', result.get('error', 'Inspect feedback')),
          file=sys.stderr)
else:
    print('Inspect remaining work; session: ' + result['sessionId'], file=sys.stderr)
```

Configure `AGENT_CHAT_ENDPOINT` to your compatible chat endpoint, `AGENT_MODEL`
to its model ID, and `AGENT_API_KEY` if needed, then run:

```sh
python3 edit_svg.py /absolute/workspace > /tmp/svg-sdk-result.json
```

This calls the configured provider and edits the supplied workspace. For a local
run without an LLM, use [svg_edit_example.py](svg_edit_example.py) instead; it uses
the same `Agent` API and supplies deterministic responses for the four turns below.
Actual model runs may need more turns, encounter conflicts, or ask a question.
The recorded transcript contains workspace source and tool output; store it with
the same access policy as the project.

The SDK calls `model(request)` once per reserved turn. Your callback should return
one response dictionary or JSON text; it should not execute the proposed file or
command action itself. `Agent.run` validates the response, executes the tool,
records its observation and supplies it to the next callback invocation. Both
`commands=[sys.executable]` and `allow_commands=True` are needed for verification;
`allow_edits=True` enables the SVG write. The executable list is a permission
boundary, not an OS sandbox.

`max_steps=12` bounds this invocation. `on_event` receives coding progress/submit
results, whereas `model` receives the full planning request. `result` carries the
terminal status, summary and session ID; `session['events']` carries the retained
evidence. Closing the context manager releases runtime resources. Provider/HTTP
exceptions propagate to the caller after the driver cancels the active run;
previous file effects can remain, so inspect the saved session before retrying.

If the run waits or pauses, keep its `sessionId` and use the same workspace to
resume explicitly, supplying a follow-up or answer:

```python
with Agent(str(workspace), commands=[sys.executable]) as agent:
    result = agent.run(
        'Keep the existing viewBox and dimensions; continue the SVG verification.',
        model,
        session_id=saved_session_id,
        max_steps=12,
        on_event=on_event)
```

Here `saved_session_id` is the previous result's `sessionId`, and `model` and
`on_event` are the callbacks above. Resume retains the session's original
permissions. Inspect any interrupted command or unknown call outcome first; do
not start a second editing run merely to replay an action with uncertain effects.

## Message 1: host → model, inspect the source

Selected fields from the first request (the real request also contains complete
`tools`, `instructions`, `responseSchema` and runtime context):

```json
{
  "protocol": "suite-coding-agent/v1",
  "sessionId": "svg_demo",
  "step": 1,
  "goal": "Change badge.svg rectangle fill from #ef4444 to #2563eb; preserve geometry and verify SVG XML.",
  "permissions": {
    "allowEdits": true,
    "allowCommands": true,
    "applyProject": false
  },
  "events": [
    {
      "index": 0,
      "time": "2026-11-18T20:19:36Z",
      "kind": "turn",
      "value": {
        "step": 1,
        "userRevision": -1,
        "projectInstructions": {
          "target": ".",
          "sources": [],
          "complete": true,
          "warnings": []
        }
      }
    }
  ]
}
```

Model → driver, the first response:

```json
{
  "sessionId": "svg_demo",
  "step": 1,
  "status": "act",
  "plan": "Read current SVG source",
  "action": {
    "tool": "read_file",
    "args": {
      "path": "badge.svg"
    }
  }
}
```

Driver → runtime: validate the current identity and dispatch `read_file` with
`{"path":"badge.svg"}`. Runtime → driver: read actual bytes and record the result.
The next model request includes this observation (extra event/result metadata omitted):

```json
{
  "kind": "observation",
  "value": {
    "id": "svg_demo_1",
    "tool": "read_file",
    "ok": true,
    "result": {
      "path": "badge.svg",
      "text": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 60\">\n  <rect id=\"badge\" x=\"10\" y=\"10\" width=\"100\" height=\"40\" fill=\"#ef4444\"/>\n</svg>\n",
      "offset": 0,
      "nextOffset": 143,
      "totalCharacters": 143,
      "done": true,
      "hash": "99ac5c781ff44e64514b023c59c293577ebcdc20fdc3a9da9b6542fff9421fe1",
      "bytes": 143
    }
  }
}
```

The file text is evidence of what exists. Its `hash` binds the next proposal to
that source revision. The model must not guess a hash or treat the user's color
request as evidence that the file already contains that color.

## Message 2: host → model with source, model → driver with edit

The host sends the full request again with `step: 2`, the same goal and permissions,
and the recorded read observation in `events`. For this callback interface, the
observation is nested inside request JSON; it is not a provider-native tool message.

Model → driver:

```json
{
  "sessionId": "svg_demo",
  "step": 2,
  "status": "act",
  "plan": "Change only the rectangle fill",
  "action": {
    "tool": "apply_edits",
    "args": {
      "path": "badge.svg",
      "expectedHash": "99ac5c781ff44e64514b023c59c293577ebcdc20fdc3a9da9b6542fff9421fe1",
      "edits": [
        {
          "find": "fill=\"#ef4444\"",
          "replacement": "fill=\"#2563eb\""
        }
      ]
    }
  }
}
```

Driver → runtime: check edit permission, the current whole-file hash and the exact
match, then replace only the fill attribute. The write happens at this point;
completion is not required to commit it. If the file changed meanwhile, the runtime
returns a revision conflict and the model must reread and adapt.

Runtime → driver → next model request, selected observation fields:

```json
{
  "kind": "observation",
  "value": {
    "id": "svg_demo_2",
    "tool": "apply_edits",
    "ok": true,
    "result": {
      "path": "badge.svg",
      "hash": "80c68c2e5a979cf9f3581685c90d07fcf9fc335989cb533faf01dd4c988c5157",
      "bytes": 143,
      "recoverable": true,
      "edits": 1,
      "replacements": 1
    }
  }
}
```

This receipt establishes that the edit executed. It does not establish that the
SVG is valid or that its appearance was checked.

## Message 3: host → model with edit receipt, model → driver with verification

The third request has `step: 3` and includes both earlier observations. The model
requests a real command through the allowlisted interpreter:

```json
{
  "sessionId": "svg_demo",
  "step": 3,
  "status": "act",
  "plan": "Check SVG XML, color and unchanged geometry",
  "action": {
    "tool": "run_command",
    "args": {
      "command": "/usr/bin/python3",
      "args": [
        "-c",
        "import xml.etree.ElementTree as ET; r=ET.parse('badge.svg').getroot(); n=r.find('{http://www.w3.org/2000/svg}rect'); assert r.attrib['viewBox']=='0 0 120 60'; assert n.attrib==dict(id='badge',x='10',y='10',width='100',height='40',fill='#2563eb'); print('PASS: SVG XML, blue fill, and original geometry')"
      ]
    }
  }
}
```

`run_command.args` is literal argv, with no shell expansion. The Python program
parses the SVG as XML and asserts its viewBox and every rectangle attribute,
including the new fill. This checks the requested color and original geometry.
It does not render the SVG or establish visual quality.

Runtime → driver → fourth model request, selected command receipt fields:

```json
{
  "kind": "observation",
  "value": {
    "id": "svg_demo_3",
    "tool": "run_command",
    "ok": true,
    "result": {
      "exitCode": 0,
      "stdout": "PASS: SVG XML, blue fill, and original geometry\n",
      "stderr": "",
      "timedOut": false,
      "cancelled": false,
      "verificationBinding": {
        "inputDigest": "9cc82cca7c9a9c7d367201d1f880f3b21a90fd3cb2c8193646bbd2b0f18c213d",
        "inputs": [
          {
            "kind": "workspace",
            "path": "badge.svg",
            "hash": "80c68c2e5a979cf9f3581685c90d07fcf9fc335989cb533faf01dd4c988c5157"
          }
        ],
        "stable": true,
        "complete": true,
        "boundFiles": 1,
        "changedDuringCommand": [],
        "warnings": [],
        "note": "Hashes cover known inspected/edited workspace files and managed scripts, not every dependency or command-side effect. Matching hashes establish input continuity, not test adequacy, hermeticity or an atomic snapshot. Changed inputs require fresh verification; never replay a command automatically."
      }
    }
  }
}
```

The full receipt also carries command/output identifiers and other runtime metadata.
The program's zero exit code and assertions are verification evidence; `ok: true`
alone would only establish successful tool dispatch. The source binding associates
the command with known SVG inputs. A later edit would invalidate that evidence.

## Message 4: model → driver with completion, driver → caller with result

The fourth request includes current verification freshness and all three observations.
The model returns:

```json
{
  "sessionId": "svg_demo",
  "step": 4,
  "status": "done",
  "plan": "Report verified SVG source edit",
  "action": null,
  "summary": "Changed badge.svg rectangle fill from red to blue; preserved geometry.",
  "verification": [
    "Python XML parse and exact rectangle/viewBox assertions passed. No visual rendering check."
  ]
}
```

The runtime checks completion and returns this separate result to `Agent.run`'s
caller:

```json
{
  "status": "complete",
  "outcome": "complete",
  "summary": "Changed badge.svg rectangle fill from red to blue; preserved geometry.",
  "sessionId": "svg_demo"
}
```

The caller can display the summary and verification evidence. The changed SVG
already exists in the workspace; it is not encoded in the final result object.
For this fixture the resulting file is:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <rect id="badge" x="10" y="10" width="100" height="40" fill="#2563eb"/>
</svg>
```

To deliver it elsewhere, the host reads/downloads that file or separately packages
results. In a graphical application, importing/applying it uses that application's
project validation and review policy. A workspace write does not automatically
update an already open browser document.

## Consider skills, `AGENTS.md`, and other agents

For the SVG task, distinguish these three inputs:

| Input | Purpose | How it reaches the model |
| --- | --- | --- |
| Scoped `AGENTS.md` guidance | Repository conventions for the target file | `projectInstructions` on coding requests and `read_project_instructions` observations |
| Reusable skill | A versioned procedure for a recurring task, such as safe SVG source edits | `skill_search` metadata, then complete `skill_read` content in observations |
| Another agent | An optional separate model/tool loop for a bounded subtask | Host-configured delegation result; not enabled by creating an `AGENTS.md` file |

The four-turn fixture above needs none of these additional resources. When they
are present, add discovery/reading turns **before editing**, and increase the
step budget accordingly. The following messages illustrate an extended run;
`svg_guided` is a new example session, not the earlier four-turn transcript.

### Read instructions for the SVG's scope

For example, an existing workspace root `AGENTS.md` might contain:

```markdown
# SVG asset maintenance
- Preserve the SVG namespace, viewBox, element IDs and geometry.
- For a color-only request, change only the requested fill attribute.
- Verify XML parsing and the requested attributes after the edit.
- Report whether visual rendering was checked.
```

A nested `assets/AGENTS.md` applies only when the target is in `assets/`.
For this walkthrough the target remains root-level `badge.svg`. The Python driver
refreshes `projectInstructions` before each planning turn, using the most recent
relevant path. Before switching to a new subtree, explicitly request its scope:

```json
{
  "sessionId": "svg_guided", "step": 1, "status": "act",
  "plan": "Read repository guidance for the SVG before editing",
  "action": {"tool": "read_project_instructions", "args": {"path": "badge.svg"}}
}
```

The next request contains the observation with `result.documents`: each document
has `path`, `scope`, `sha256`, `bytes` and exact `content`. Inspect `complete` and
`warnings`; a skipped/unreadable file is not evidence that no guidance exists.
Root-to-target discovery chooses the first nonempty `AGENTS.override.md` or
`AGENTS.md` at each directory. Deeper guidance applies within its subtree;
repository guidance remains subordinate to host/system and explicit user
instructions and cannot expand permissions or executable allowlists.

This SDK does not scan unrelated directories or arbitrary home instructions.
A file named `AGENTS.md` is guidance, not an agent registry or a command to spawn
reviewers. The host need not create one for a simple SVG change.

### Discover and read an appropriate SVG skill

The coding runtime's workspace skill library is versioned SQLite data, separate
from ordinary `AGENTS.md` files. Merely putting a `SKILL.md` somewhere on disk does
not register it in `skill_search`; read such a file through file tools if explicitly
provided, or deliberately register its procedure through the library API.

For a disposable demo workspace, a host can prepare a procedure before `agent.run`:

```python
# Inside the existing `with Agent(...) as agent:` block, before starting the run.
# Seed a new ID once. In a real workspace, read the current revision before updates.
skill = agent.dispatch({
    'op': 'skill_save',
    'id': 'svg-fill-edit',
    'expectedRevision': 0,
    'name': 'SVG fill-only source edit',
    'description': 'Change an SVG fill while preserving namespace and geometry.',
    'content': (
        '# SVG fill-only source edit\n'
        'Prerequisites: scoped guidance read; current SVG available.\n'
        '1. Read the SVG and retain its actual SHA-256.\n'
        '2. Use one exact guarded edit for the requested fill.\n'
        '3. Parse the resulting XML and assert fill, viewBox and geometry.\n'
        '4. Report the actual checks and whether rendering was inspected.\n'
        'Pitfalls: do not replace a stale hash, rewrite unrelated XML, or claim '
        'a visual review from XML checks alone.\n'
    ),
    'reason': 'Seed a demonstration procedure; not a verified learned skill.',
    'enabled': True
})
```

This is a host-directed library write, not an LLM observation or automatic
execution. With no successful command evidence it remains unverified. Do not
replace an existing skill using `expectedRevision: 0`: inspect its current revision
and preserve its content intentionally. Registering a skill does not mean the
model has read it.

Extend the `agent.run` goal with: “Read scoped guidance for badge.svg, search for
relevant SVG skills, read any selected skill completely at its returned revision,
then perform the source edit and verification.” Allow, for example,
`max_steps=16` for the extra discovery turns. Model → driver:

```json
{
  "sessionId": "svg_guided", "step": 2, "status": "act",
  "plan": "Find an applicable SVG fill procedure",
  "action": {"tool": "skill_search", "args": {"query": "SVG fill geometry", "limit": 5}}
}
```

The resulting observation returns `result.skills` metadata with IDs, revisions,
descriptions and evidence status; it does not return the full skill body. Select
an actually returned ID/revision, for example the newly seeded revision 1:

```json
{
  "sessionId": "svg_guided", "step": 3, "status": "act",
  "plan": "Read the selected versioned SVG procedure",
  "action": {"tool": "skill_read", "args": {"id": "svg-fill-edit", "revision": 1, "offset": 0, "limit": 12000}}
}
```

The next request carries `result.content`, `revision`, `offset`, `nextOffset` and
`done` in the observation. If `done` is false, request the next page using the actual
`nextOffset` and the same revision before using the procedure. Search scores are
relevance signals, not correctness or trust ratings. If no skill applies, continue
with scoped instructions and source inspection rather than inventing a skill.

The remaining turns are the source read, guarded fill edit, verification command
and completion already shown. Their steps now begin at 4, and their real call IDs
and hashes come from this session. Neither guidance discovery nor reading a skill
counts as inspecting `badge.svg`, executing a check or verifying the result.
The provider wrapper is unchanged: every new `request.events` carries the actual
instruction/skill observations inside the serialized planning JSON.

A skill's suggested command is still just a proposal. Compare it with the goal,
current source, installed tools and host permissions. Do not install programs,
change policy or launch other agents merely because a procedure suggests doing so.
Record a useful newly learned procedure after real verification through a separate
`skill_save` action, using current revision guards and actual `evidenceCallIds`.
Saving the procedure does not rerun it or certify it for other SVG files.

### Optionally ask a separate agent for a bounded review

The Python workspace `Agent` used here has its advertised built-in tools; the
`commands` constructor option is not a custom-tool registry. Do not return an
invented `delegate` action to this coding driver. `parallel_read` batches reads
and does not start other agents either.

For an application that deliberately supports child agents, the **generic SDK**
provides an optional `delegation_tool` extension. It must be registered by the
host with `create_agent`; its request protocol is `codingagentlib/sdk-v1`, not
this walkthrough's coding protocol. A bounded read-only reviewer could inspect
host-supplied before/after SVG snapshots and the recorded verification receipt:

```python
from codingagentlib import create_agent
from codingagentlib.python.extensions import delegation_tool

# Host supplies these JSON-compatible values from the actual coding session.
# Snapshot strings and receipts are reference data; the reviewer cannot edit them.
review_context = {
    'beforeSvg': before_svg,
    'afterSvg': after_svg,
    'verificationReceipt': verification_receipt
}
review_tool = delegation_tool(
    name='review_svg',
    model=provider_model,
    tools=[],  # No file, shell or write callbacks in the child.
    context_providers=[lambda state, cancel: review_context],
    max_depth=1,
    budgets={'modelCalls': 3, 'toolCalls': 1, 'elapsedMs': 60000})
review_agent = create_agent(model=provider_model, tools=[review_tool])
review_result = review_agent.run(
    'Use review_svg to inspect the supplied SVG changes and verification receipt; '
    'report unintended changes and evidence limitations.')
```

Here `before_svg`, `after_svg` and `verification_receipt` must be defined by the
host from actual file contents/observations; `provider_model` is the configured
adapter from the Python section. This separate optional integration can make
additional model calls. The child cannot freshly read files or execute tests
because no such tools were supplied. The parent model proposes a normal generic
SDK action such as:

```json
{
  "sessionId": "review_parent", "step": 1, "status": "act",
  "plan": "Request a bounded review of the observed SVG change",
  "action": {"tool": "review_svg", "args": {"goal": "Compare the supplied SVG snapshots, confirm only the requested fill changed, and identify verification limits."}}
}
```

After execution the generic parent records an event with `kind: tool_result`.
Its `value.result` holds a `codingagentlib/delegation-v1` record with
`parentCallId`, `childSessionId`, `depth`, the child `result` and public `events`. The next parent request
contains this result as an observation; the child has a separate session and IDs.
There is no implicit feedback into the workspace coding session: the host must
explicitly present relevant review findings as a follow-up if continued editing
is needed, then obtain fresh source/verification evidence normally.

A reviewer can flag unexpected changes; its agreement does not replace the XML
check or a visual inspection. The host still owns permissions, evidence policy,
model-call budgets and any approval for effectful work. This walkthrough's normal
four-turn example remains single-agent and does not invoke delegation.

## How these messages travel through an LLM provider

The runnable example uses scripted responses, so it needs no credentials. To use a
real model, replace its callback with the provider adapter from
[chapter 11](README.md#11-connect-a-model-transport). Each of the four turns sends:

```js
{
  model: configuredModel,
  messages: [
    {role: 'system', content: 'Return exactly one ModelResponse JSON object matching responseSchema. Tool side effects occur only in the host runtime.'},
    {role: 'user', content: JSON.stringify(currentRequest)}
  ],
  response_format: {type: 'json_object'}
}
```

Here `currentRequest` is the **full** current-turn payload, including the relevant
observations shown above. The bundled compatible adapter extracts
`choices[0].message.content` and returns that JSON text to the driver. Each model
response shown in this walkthrough is the decoded content of that provider field.
The host executes tools and records their results before making the next provider
call. It does not ask the model to execute Python inside the provider service.

Do not send the final `Agent.run` result back as if it were a tool observation.
The terminal result belongs to the caller; intermediate receipts belong in the
next model request. A later user follow-up resumes using session APIs and fresh
turn identities.

## Run and inspect the complete exchange

From the repository root, with the local Python package available:

```sh
PYTHONPATH=. python3 docs/coding-agent-book/svg_edit_example.py > /tmp/svg-agent-transcript.json
```

The [runnable example](svg_edit_example.py) creates and removes a temporary
workspace, executes the real read/edit/verification tools, and prints full
`exchanges` (each containing `request` and scripted `response`), the terminal
`result`, and final `svg`. It asserts the resulting bytes and accepted completion.
The transcript retains source hashes, tool definitions, schema and observation
metadata for inspection. It does not call a paid provider, edit repository assets,
or perform a visual rendering check.
