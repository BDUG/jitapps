const assert=require('node:assert/strict'),A=require('./model.js'),Scope=require('./exchange-scope.js'),M=require('./mermaid.js');
for(const type of ['metamodel','instances']){const model=Scope.exportModel(A.demo,type),text=M.toMermaid(model,type);assert.match(text,/^flowchart LR/);assert.deepEqual(M.fromMermaid(text,type,A.demo),model);assert.throws(()=>M.fromMermaid(text,type==='instances'?'metamodel':'instances',A.demo),/model scope/);const renamed=M.fromMermaid(text.replace('N0["','N0["Renamed '),type,A.demo);assert.match((type==='metamodel'?renamed.components:renamed.instances)[0].name,/^Renamed /);}
const chain=M.fromMermaid('flowchart LR\nA["Cause"] -->|+| B("Effect") --> C{Outcome}\nC -.->|−| A\n%% unmatched parenthesis ( in a comment');
assert.equal(chain.components.length,3);assert.equal(chain.dependencies.length,3);assert.equal(chain.dependencies[0].label,'+');assert.equal(chain.dependencies[2].label,'−');A.validate(chain);
const native=M.fromMermaid('graph LR; G["Entry :: gateway"] -->|"upstream → api"| S["Order :: service"]','instances',A.demo);assert.equal(native.instances.length,2);assert.equal(native.connections[0].source.portId,'data-1');assert.equal(native.connections[0].target.portId,'data-0');
const tricky=Scope.exportModel(A.demo,'metamodel');tricky.components[0].name='A "label" & <tag> | #42; \\ newline\nNext';tricky.components[0].parameters.path='ends in \\';assert.deepEqual(M.fromMermaid(M.toMermaid(tricky,'metamodel')),tricky);assert.equal(M.parse(M.toMermaid(A.demo,'metamodel')).payload.model.instances.length,0);
const empty=Scope.exportModel({...A.demo,components:[],dependencies:[],instances:[],connections:[]},'metamodel');assert.deepEqual(M.fromMermaid(M.toMermaid(empty,'metamodel')),empty);
for(const text of ['sequenceDiagram\nA->>B:Hi','flowchart LR\nclick A "https://example.org"','flowchart LR\nA["one"]\nA["two"]','flowchart LR\nA["bad]'])assert.throws(()=>M.fromMermaid(text));
const inferred=M.fromMermaid('flowchart LR\nA["Unknown"] --> B["Also unknown"]','instances',A.demo);assert.equal(inferred.instances.length,2);assert.equal(inferred.components.length,A.demo.components.length+2);
assert.throws(()=>M.fromMermaid('flowchart LR\nA["Entry :: gateway"] -->|"unknown → api"| B["Order :: service"]','instances',A.demo),/Specify one out port/);
assert.throws(()=>M.fromMermaid('flowchart LR\nA["Entry :: missing"]','instances',A.demo),/Unknown or ambiguous component/);
console.log('PASS: Mermaid scoped round trips, native cyclic chains, typed instances/ports, escaped labels, empty exports and unsupported/unsafe syntax rejection.');

const rich=M.fromMermaid([
 '---','title: Improved chain','---','flowchart TD',
 'subgraph system["System"]','direction LR',
 'subgraph inner["Inner group"]','A(["Start<br/>here"]):::hot -- "+ effect" --> B{{Decision}}','end',
 'B & C((Cause)) -. delayed .-> D[(Store)] & E[[Result]]',
 'D <--> E','end',
 'classDef hot fill:#ace,stroke:#123456',
 'style E fill:#aabbcc',
 'linkStyle default stroke:#123456',
 '%% inline remarks','E --> A %% feedback',
].join('\n'));
assert.equal(rich.name,'Improved chain');
assert.equal(rich.components.find(c=>c.id==='A').parentId,'inner');
assert.equal(rich.components.find(c=>c.id==='inner').parentId,'system');
assert.equal(rich.components.find(c=>c.id==='A').name,'Start\nhere');
assert.equal(rich.components.find(c=>c.id==='A').color,'#aaccee');
assert.equal(rich.components.find(c=>c.id==='E').color,'#aabbcc');
assert.equal(rich.dependencies.length,8);
assert.equal(rich.dependencies[0].label,'+ effect');
assert.ok(M.lastWarnings.length>=2);
assert.equal(M.fromMermaid('graph RL; 1[One] <-- 2[Two]').dependencies[0].source,'2');
assert.equal(M.fromMermaid('graph RL; 1[One] <-- 2[Two]').components[1].x<0,true);
const fenced=M.fromMermaid('A report with a diagram:\n'+String.fromCharCode(96).repeat(3)+'mermaid\nflowchart LR\nA --> B\n'+String.fromCharCode(96).repeat(3)+'\nMore prose.');
assert.equal(fenced.components.length,2);
assert.throws(()=>M.fromMermaid('flowchart LR\nA -->'),/Mermaid line 2/);
assert.throws(()=>M.fromMermaid('flowchart LR\nsubgraph G\nA --> B'),/Unclosed Mermaid subgraph/);
const configured=M.fromMermaid('%%{init: {"theme":"dark"}}%%\nflowchart LR\nA --> B');
assert.equal(configured.components.length,2);assert.ok(M.lastWarnings.some(w=>w.includes('configuration')));
const groupedInstances=M.fromMermaid('flowchart LR\nsubgraph delivery[Delivery]\nG["Entry :: worker"] -- causes --> S["Order :: gateway"]\nend','instances',A.demo);
assert.equal(groupedInstances.instances.length,2);assert.equal(groupedInstances.connections.length,1);assert.ok(M.lastWarnings.some(w=>w.includes('flattened')));
console.log('PASS: nested subgroups, colors/classes, labels, shapes, fan-out, bidirectional/reverse links, Markdown/front matter, instance normalization notes and line diagnostics.');

const compact=M.fromMermaid('flowchart LR\nmy-id-->B--works-->C\nA&B-->C&D');
assert.equal(compact.dependencies.length,6);assert.equal(compact.dependencies[1].label,'works');
const namedType=M.fromMermaid('flowchart LR\nW["Worker :: Notification Service"]--callback -->G["Entry :: API Gateway"]','instances',A.demo);
assert.equal(namedType.instances[0].componentId,'worker');

const compactPorts=M.fromMermaid('flowchart LR\nG["Gateway :: gateway"]-->|upstream->api|S["Orders :: service"]','instances',A.demo);
assert.equal(compactPorts.connections[0].target.portId,'data-0');
const original=A.demo.instances[0],renamedNative=M.fromMermaid('flowchart LR\n'+original.id+'["Renamed existing instance"]','instances',A.demo);
assert.equal(renamedNative.instances[0].name,'Renamed existing instance');assert.deepEqual(renamedNative.instances[0].ports,original.ports);assert.deepEqual(renamedNative.instances[0].parameters,original.parameters);

const both=M.fromMermaid('flowchart LR\nDemand -- increases --> Load\nLoad -- reduces --> Demand','both',A.demo);
assert.equal(both.components.length,2);assert.equal(both.instances.length,2);assert.equal(both.connections.length,2);assert.equal(both.dependencies.length,2);assert.deepEqual(A.inspect(both),[]);assert.equal(both.modelType,undefined);assert.deepEqual(Scope.apply(A.demo,both,'both'),both);
const complete=A.clone(A.demo);assert.deepEqual(Scope.apply(both,complete,'both'),complete);assert.throws(()=>Scope.apply(both,Scope.exportModel(complete,'metamodel'),'both'),/complete workspace/);
const broken=A.clone(complete);broken.instances[0].componentId='missing';assert.throws(()=>Scope.apply(complete,broken,'both'),/missing component/);assert.deepEqual(complete,A.demo);
const fromMeta=M.fromMermaid(M.toMermaid(A.demo,'metamodel'),'both',A.demo);assert.equal(fromMeta.instances.length,fromMeta.components.length);assert.equal(fromMeta.connections.length,fromMeta.dependencies.length);assert.deepEqual(A.inspectCompatibility(fromMeta),[]);
const fromInstances=M.fromMermaid(M.toMermaid(A.demo,'instances'),'both',A.demo);assert.deepEqual(fromInstances.components,A.demo.components);assert.deepEqual(fromInstances.instances,A.demo.instances);
console.log('PASS: Both models generation, complete-workspace replacement, invalid/scoped workspace rejection, and scoped Mermaid expansion.');

assert.throws(()=>M.fromMermaid('flowchart LR\nDemand --> S["Order :: service"]','both',A.demo),/Mixed Mermaid mappings/);

const direct=M.fromMermaid('flowchart LR\nDemand-->Load\nLoad-->Demand','instances',A.demo);assert.deepEqual(direct.components.slice(0,A.demo.components.length),A.demo.components);assert.deepEqual(A.inspect(direct),[]);const repeated=M.fromMermaid('flowchart LR\nDemand-->Load\nLoad-->Demand','instances',direct);assert.equal(repeated.components.length,direct.components.length);assert.equal(repeated.dependencies.length,direct.dependencies.length);
console.log('PASS: unmapped native instance imports infer connected types while retaining active definitions, with repeat-import stability.');

const fs=require('node:fs'),typedExample=fs.readFileSync(require('node:path').join(__dirname,'examples/cause-effect-instances.mmd'),'utf8'),emptyMap={...A.clone(A.demo),components:[],dependencies:[],instances:[],connections:[]};
const typedEmpty=M.fromMermaid(typedExample,'both',emptyMap);assert.equal(typedEmpty.components.length,2);assert.equal(typedEmpty.instances.length,2);assert.equal(typedEmpty.connections.length,1);assert.deepEqual(A.inspect(typedEmpty),[]);
const partial={...A.clone(emptyMap),components:[{id:'service',name:'Existing service',category:'',description:'Retain this',parentId:null,color:'#123456',x:0,y:0,parameters:{owner:'Ada'},ports:[]}]};
const typedPartial=M.fromMermaid(typedExample,'both',partial);assert.equal(typedPartial.components.find(c=>c.id==='service').description,'Retain this');assert.equal(typedPartial.components.find(c=>c.id==='service').ports[0].id,'api');assert.deepEqual(A.inspect(typedPartial),[]);
assert.throws(()=>M.fromMermaid(typedExample,'instances',emptyMap),/Unknown or ambiguous component type/);
assert.equal(M.fromMermaid(typedExample,'both',typedPartial).components.length,2);
console.log('PASS: typed Both-model example with empty/partial metamodel, new directional ports, retained definitions and stable reimport.');
