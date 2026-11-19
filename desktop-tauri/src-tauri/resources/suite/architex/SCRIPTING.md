# Architex JavaScript validation API v2

Open **Validation → Rules** to create, edit, enable/disable, import, export, and run JavaScript rules. A rule is a synchronous JavaScript **function body** receiving `api`. Do not wrap it in a module, export, or function declaration. Use `api.report(...)`, the error/warning/info helpers, or return an array of issue objects. Do not combine returning the same issues with reporting them, or they will appear twice. Promise/async rules are not supported.

The built-in `instance-port-connected` rule is enabled by default and can be deactivated/reactivated independently, using its rule-list checkbox or Enabled setting. It checks every instance port, counting either an incoming or outgoing connection. Model integrity checks (schema, unique IDs, valid references, and acyclic subgroup containment) remain independent of custom scripts. Cyclic dependencies and port connections are valid.

```js
for (const instance of api.instances.all()) {
  for (const port of api.instances.ports(instance.id)) {
    if (!api.instances.connected(instance.id, port.id)) {
      api.error(instance.name + ' → ' + port.name + ': port is not connected', instance.id, port.id);
    }
  }
}
```

## Query API

Every rule receives an independent, deeply frozen JSON snapshot. Queries never modify the editor. Unknown singular IDs return `undefined`; collection queries return arrays (empty if no matches). Connections and dependencies are directed, but `connections` and `neighbors` queries include both directions.

| API | Result |
| --- | --- |
| `api.version` | API version, currently `2` |
| `api.workspace` | Complete workspace snapshot: version, name, components, dependencies, instances, connections |
| `api.metamodel.components()` | All structural component definitions |
| `api.metamodel.component(componentId)` | Component by ID |
| `api.metamodel.ports(componentId)` | Connection policies: `{id, name, description, allowedComponentIds}` |
| `api.metamodel.children(componentId)` | Immediate subgroups; pass `null` for top-level components |
| `api.metamodel.parent(componentId)` | Parent component, if any |
| `api.metamodel.dependencies()` | All `{id, source, target, label}` dependencies |
| `api.metamodel.incoming(componentId)` | Dependencies targeting this component |
| `api.metamodel.outgoing(componentId)` | Dependencies sourced from this component |
| `api.instances.all()` | All instances |
| `api.instances.get(instanceId)` | Instance by ID, including name, componentId, position and parameter key/value object |
| `api.instances.ofComponent(componentId)` | Instances referencing this component |
| `api.instances.component(instanceId)` | Component definition for an instance |
| `api.instances.ports(instanceId)` | Independent instance data points: `{id, name, description, definitionId}` |
| `api.instances.port(instanceId, portId)` | One instance data point |
| `api.instances.definition(instanceId, portId)` | Its component connection-policy definition |
| `api.instances.allowed(source, target)` | Whether both endpoint policies allow the peer component type; endpoints use `{instanceId, portId}` |
| `api.instances.parameters(instanceId)` | Instance parameter object, or undefined |
| `api.instances.connections(instanceId, portId?)` | Connections on an instance, optionally restricted to one port |
| `api.instances.connected(instanceId, portId)` | Whether this port has at least one connection |
| `api.instances.neighbors(instanceId)` | Distinct instances joined by at least one connection |
| `api.connections.all()` | All connections, each with `{id, source: {instanceId, portId}, target: {instanceId, portId}}` |
| `api.connections.get(connectionId)` | Connection by ID |
| `api.connections.source(connectionId)` | Source instance data point |
| `api.connections.target(connectionId)` | Target instance data point |

Component parameter defaults are available as `component.parameters`. IDs are stable references; names are editable labels. Parameter values are strings. Queries return plain objects, not UI elements.

## Reporting

```js
api.report({
  severity: 'error', // 'error' (default), 'warning', or 'info'
  message: 'Explain the problem', // required non-empty string
  nodeId: 'orders-prod',          // optional component/instance ID for issue navigation
  portId: 'api'                   // optional port ID
});
api.error('Missing setting', 'orders-prod');
api.warning('Missing description', 'service');
api.info('Review this endpoint', 'orders-prod', 'api');
// Alternatively:
return [{ severity: 'warning', message: 'Needs review', nodeId: 'service' }];
```

The runner adds `ruleId` and `ruleName`. Exceptions, syntax errors, unsupported return values and timeouts become error findings with `scriptError: true`. A failing rule does not suppress other rules. Each rule has a 1.5-second worker timeout (including worker startup) and a 1,000 reported-issue limit. The local library supports up to 20 custom rules, each up to 50 KB.

## Example: validate both levels

```js
for (const component of api.metamodel.components()) {
  if (!component.description.trim()) {
    api.warning(component.name + ': add a description', component.id);
  }
}
for (const instance of api.instances.all()) {
  const type = api.instances.component(instance.id);
  for (const key of Object.keys(type?.parameters || {})) {
    if (!Object.hasOwn(instance.parameters, key)) {
      api.error(instance.name + ': missing parameter ' + key, instance.id);
    }
  }
}
```

## Storage, execution and reports

Rules save in this browser's localStorage separately from models. Changes to the architecture rerun enabled rules automatically. Importing a `.js` file creates a **disabled** rule; inspect the body, enable it and choose **Save & run**. Rules are not included in model JSON/YAML/SVG/draw.io/Markdown imports or exports. Export scripts individually as `.js` files. Validation JSON reports include rule definitions, findings, severity and rule attribution. Store reports appropriately because rule source may contain sensitive literals.

Only run trusted scripts. A worker prevents ordinary rule code from accessing editor DOM or localStorage and timeouts stop runaway execution. Common network APIs are disabled in the worker, but this is **not a security sandbox for hostile JavaScript**. Scripts cannot change the model through the query API. Serve Architex over HTTP for worker support; browser restrictions may prevent custom scripts on `file://` (a worker error is reported). Core validation still works there. Content Security Policy must permit local workers and dynamic JavaScript compilation for user-authored rule bodies.

## Programmatic use

Browser: `await window.ArchitexScripting.validate()` returns built-in, structural, and enabled custom findings for a snapshot of the current workspace. `window.ArchitexScripting.listRules()` returns a copy of the library. `window.ArchitexValidation` exposes the portable library.

Node.js, without a browser:

```js
const V = require('./validation.js');
const issues = V.runRule(model, { id: 'descriptions', name: 'Descriptions' }, api => {
  for (const component of api.metamodel.components()) {
    if (!component.description) api.warning('Description required', component.id);
  }
});
const missingConnections = V.defaultIssues(model);
const api = V.createAPI(model, issue => console.log(issue));
```

`runRule` accepts a trusted callback function, not source text. Only the browser worker compiles custom script source. Node callback execution is synchronous and does not impose a timeout. Model field structure is defined by `workspace.schema.json`; semantic query contracts are defined here. Both the schema and this guide can be downloaded in the UI.

## Portable rule libraries and coding agents

**Export library** downloads all custom rules and the built-in rule's enabled state as JSON, independently of architecture models and provider settings. **Import library** validates the complete document before replacing the library. Custom scripts import disabled unless **Activate enabled scripts when importing a rule library** is explicitly selected. Individual `.js` import/export remains available.

```json
{
  "format": "architex-validation-rules",
  "version": 1,
  "defaultRuleEnabled": true,
  "rules": [
    {"id": "descriptions", "name": "Component descriptions", "enabled": false,
     "source": "for (const c of api.metamodel.components()) { if (!c.description) api.warning('Description required', c.id); }"}
  ]
}
```

Coding agents should generate synchronous JavaScript function bodies using the query/reporting API above. Preserve stable rule IDs when editing, use meaningful messages with nodeId/portId, and do not emit imports, modules, network calls, DOM access, or asynchronous code. Use `enabled: false` for new or changed rules until reviewed. Never include API keys or provider configuration in a validation rule.

**Agent API (.txt)** downloads this complete reference as a plain text file and works offline. `ArchitexScripting.exportLibrary()` returns the portable library; `replaceLibrary(document, {activate: false})` validates and replaces it. To make an API-driven replacement undoable, call the editor checkpoint before applying; UI imports and assistant proposals do this automatically. Ctrl/Command Z undoes model and rule changes together.

Complete rule-library JSON imports are limited to 8 MB, with at most 20 custom rules and 50,000 source characters per rule. These limits allow all valid library exports to be re-imported. Imported individual JavaScript files are limited to 50 KB; names are capped at 120 characters.

## API v2: data points, blocking rules, and highlights

Metamodel ports describe allowed instance component types, not data points. Instance ports are independent arrays and refer to a policy through `definitionId`. Names can differ from metamodel labels, and multiple data points can reference a policy. Queries expose frozen snapshots; they do not modify either model. `api.version` and the scripting library API version are now 2; rule-library file format stays version 1.

A rule can block a new connection by reporting an error tied to its exact connection ID:

```js
for (const c of api.connections.all()) {
  const source = api.connections.source(c.id);
  const target = api.connections.target(c.id);
  if (source && target && source.name !== target.name) {
    api.report({severity: 'error', message: 'Data-point names must match',
      connectionId: c.id, nodeId: c.source.instanceId, portId: c.source.portId, blocksConnection: true});
  }
}
```

The editor evaluates enabled scripts against a candidate graph before committing a graphical connection. Findings tied to that candidate with `blocksConnection: true` reject it; script failures/timeouts also reject the attempted connection. Imported invalid connections are retained and reported so they can be repaired. AI proposals are checked for newly introduced blocking findings and active-script failures before applying.

To annotate a port:

```js
api.highlightPort(instanceId, portId, 'red', 'Unconnected data point');
// Equivalent report fields:
api.report({severity:'info', message:'Unconnected data point', nodeId:instanceId, portId, highlightColor:'red'});
```

Supported colors: red, orange, green, blue, purple. Highlights update after validation and disappear when their rule is disabled. Red annotations include inspector rows, graph circles/labels, and standalone SVG output. Highlight findings do not block a connection unless separately marked `blocksConnection`.

Loadable examples: `rules/same-data-point-name.json` / `.js` and `rules/highlight-unconnected-data-points.json` / `.js`. The Rules example loader merges a disabled example into the library; enable it after review. Whole JSON-library imports remain separate replacement operations. `ArchitexScripting.checkCandidate(workspace, library?)` returns custom findings for a candidate without applying it; `checkConnection(workspace, connection)` returns blockers for a proposed additional edge.

### Presentation and port directions

Component records expose editable `category` and `color` (six-digit hex). Both policy ports and instance data points expose `direction: "in" | "out"`. Input ports render on the left, outputs on the right. Instance directions are independent values seeded from policies when instantiated. `api.instances.allowed(source, target)` checks that the source is an output, the target is an input, and both metamodel policies allow the peer component type.


`api.metamodel.effectivePorts(componentId)` returns the frozen effective interface, including recursively exposed subgroup policies. Each entry includes `sourceComponentId`, `sourcePortId`, `exposurePath`, and `inherited`. Own policies default `exposedToParent` to true; false prevents propagation to ancestors. Inherited IDs use `exposed:<encoded-source-component-id>:<encoded-source-port-id>`. Instance definition lookup and connection permission checks resolve these effective policies, including source-type permissions for exposed endpoints. Instance data points remain independent snapshots.
