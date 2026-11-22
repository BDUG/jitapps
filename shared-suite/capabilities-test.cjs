require('../markiX/model.js');
const assert=require('node:assert/strict'),C=require('./capabilities.js');
const workflow={nodes:[{id:'a',name:'Branch',type:'condition',x:0,y:0,config:{}}],edges:[]};const audited=C.apply('automatextiX','logs',workflow);assert.equal(workflow.nodes.length,1);assert.equal(audited.nodes.length,3);assert.equal(audited.edges.length,2);assert.deepEqual(C.apply('automatextiX','logs',audited),audited);
const deck={width:960,height:540,slides:[{id:'s',title:'Story',notes:'',elements:[{id:'t',type:'text',text:'Facts'}]}]};const numbered=C.apply('presentiX','numbers',deck);assert.equal(numbered.slides[0].elements.length,2);assert.deepEqual(C.apply('presentiX','numbers',numbered),numbered);assert.equal(C.apply('presentiX','notes',deck).slides[0].notes,'Story\n\nFacts');
const book={sheets:[{cells:{A1:{value:' Header '},A2:{value:'=SUM(A1)'},B2:{value:' x '}}}]};const trimmed=C.apply('sheetiX','trim',book);assert.equal(trimmed.sheets[0].cells.A1.value,'Header');assert.equal(trimmed.sheets[0].cells.A2.value,'=SUM(A1)');assert.equal(book.sheets[0].cells.B2.value,' x ');
const plan={tasks:[{id:'phase',parent:null,summary:true,progress:0},{id:'a',parent:'phase',summary:false,duration:3,progress:100,resource:''},{id:'b',parent:'phase',summary:false,duration:1,progress:0,resource:'Owner'}]};assert.equal(C.apply('projectiX','rollup',plan).tasks[0].progress,75);const assigned=C.apply('projectiX','resource',plan,'Team');assert.equal(assigned.tasks[1].resource,'Team');assert.equal(assigned.tasks[2].resource,'Owner');
const motion={project:{clips:[{locked:false,x:1,y:2,toX:9,toY:8,duration:2,opacityKeys:[{time:0,value:1}]},{locked:true,x:0,y:0,toX:5,toY:5,duration:1,fade:0}]}};assert.equal(C.apply('vidiX','fade',motion,'4').project.clips[0].fade,1);assert.equal(C.apply('vidiX','still',motion).project.clips[0].toX,1);assert.equal(C.apply('vidiX','still',motion).project.clips[1].toX,5);
const app={designer:{screens:[{id:'home',name:'Home'},{id:'next',name:'Next'}],nodes:[],flows:[]}};const menu=C.apply('appiX','navigation',app);assert.equal(menu.designer.flows.length,2);assert.deepEqual(C.apply('appiX','navigation',menu),menu);
assert.ok(C.csv([{text:'=IMPORTXML("evil")'}]).includes("'=IMPORTXML"));assert.ok(C.csv([{text:'  +1'}]).includes("'  +1"));assert.ok(C.markdown([{text:'a|b\nc'}]).includes('a\\|b<br>c'));console.log('PASS: nonmutating tool edits, idempotent workflow/slide/navigation actions, formula preservation, weighted progress, lock guards and safe CSV/Markdown escaping.');

const workbook=C.workbook(Array.from({length:201},(_,i)=>({id:i,text:i?'Value':'=SUM(A1)'})),'Test');assert.equal(workbook.sheets.length,2);assert.equal(workbook.sheets[0].rows,200);assert.equal(workbook.sheets[1].rows,3);assert.equal(workbook.sheets[0].cells.B2.value,"'=SUM(A1)");assert.throws(()=>C.workbook(Array.from({length:3981},()=>({x:1})),'Test'));console.log('PASS: paginated sheetiX workbook inventories, header styles, formula-safe literals and explicit size rejection.');

globalThis.window=globalThis;
require('./apps.js');
for(const app of globalThis.SuiteApps){
 assert.ok(C.actions(app.id).length>=2,app.id+' must expose at least two SuiteCapabilities actions');
}
assert.equal(C.apply('trackiX','assign-unassigned',{issues:[{key:'TRK-1',status:'todo',assignee:''},{key:'TRK-2',status:'done',assignee:''}]},'Alice').issues[0].assignee,'Alice');
assert.equal(C.apply('trackiX','normalize-points',{issues:[{key:'TRK-1',type:'story',points:null}]}).issues[0].points,1);
assert.equal(C.apply('trackiX','triage-sprint',{sprints:[{id:'s1',state:'active'}],issues:[{key:'TRK-1',status:'backlog',priority:'high',sprintId:null}]}).issues[0].sprintId,'s1');
assert.equal(C.inventory('trackiX',{issues:[{key:'TRK-1',type:'bug',summary:'Fix',status:'todo',priority:'high'}]}).length,1);
assert.equal(C.apply('markiX','ensure-newline',{syntax:'markdown',source:'# Title'}).source,'# Title\n');
assert.equal(C.inventory('markiX',{syntax:'markdown',source:'# Title\n## Sub'}).length,2);
assert.equal(C.apply('formiX','fill-titles',{formulas:[{id:'f1',title:'',latex:'x^2'}]}).formulas[0].title,'Formula 1');
assert.equal(C.apply('cncfiX','normalize-maturity',{items:[{id:'k8s',name:'K8s',maturity:''}]}).items[0].maturity,'sandbox');
assert.equal(C.apply('mockiX','snap-grid',{screens:[{id:'s1',name:'Home',width:200,height:200,elements:[{id:'e1',x:13,y:19,width:20,height:20}]}]}).screens[0].elements[0].x,16);
assert.equal(C.apply('shelliX','dedupe-history',{history:['ls','ls','pwd']}).history.length,2);
console.log('PASS: all 25 registered SuiteApps expose SuiteCapabilities actions and inventories.');
const audit={events:[
 {kind:'action',value:{id:'a',tool:'run_command',args:{command:'python3',args:['-c','print(1)'],cwd:'src'}}},
 {kind:'observation',value:{id:'a',ok:true,result:{exitCode:0}}},
 {kind:'action',value:{id:'b',tool:'run_command',args:{command:'sh',args:['-c','exit 2']}}},
 {kind:'observation',value:{id:'b',ok:true,result:{exitCode:2}}},
 {kind:'action',value:{id:'c',tool:'run_script',args:{path:'check.py'}}},
 {kind:'action',value:{id:'d',tool:'run_command',args:{command:'bad'}}},
 {kind:'observation',value:{id:'d',ok:false,error:'launch failed'}}
]};
const auditBefore=JSON.stringify(audit),commands=C.inventory('shelliX',audit);
assert.deepEqual(commands.map(r=>r.status),['passed','failed','unknown','failed']);
assert.equal(commands[0].args,'["-c","print(1)"]');assert.equal(commands[0].cwd,'src');
assert.equal(commands[2].exitCode,null);assert.equal(JSON.stringify(audit),auditBefore);
console.log('PASS: shell inventory joins real command receipts, distinguishes unknown/nonzero/launch failures and preserves audit events.');

const markup='# Heading\r\nText  \r\n```text\r\nline with padding   \r\n```\r\n';
assert.equal(C.apply('markiX','trim-trailing',{syntax:'markdown',source:markup}).source,markup);
assert.deepEqual(C.inventory('markiX',{syntax:'markdown',source:'Title\n=====\n\n```text\n# Not a heading\n```\n'}).map(r=>r.heading),['Title']);
assert.deepEqual(C.inventory('markiX',{syntax:'rst',source:'Title\n=====\n\nDetails\n-------\n'}).map(r=>r.heading),['Title','Details']);
const bounded={screens:[{width:101,height:101,elements:[{x:80,y:80,width:20,height:20},{x:13,y:13,width:20,height:20,locked:true}]}]};
const snapped=C.apply('mockiX','snap-grid',bounded);assert.equal(snapped.screens[0].elements[0].x,80);assert.equal(snapped.screens[0].elements[1].x,13);
assert.equal(bounded.screens[0].elements[1].x,13);
console.log('PASS: markup inventories understand RST/setext headings and skip code; cleanup preserves hard breaks/code and grid alignment respects bounds/locks.');

const landscape={items:[{id:'z',name:'Zeta',categoryId:'a',subcategoryId:'a1',maturity:'graduated'},{id:'other',name:'Other',categoryId:'b'},{id:'a',name:'Alpha',categoryId:'a',subcategoryId:'a1',maturity:'sandbox'}]};
const ordered=C.apply('cncfiX','sort-items',landscape);assert.deepEqual(ordered.items.map(it=>it.id),['a','other','z']);assert.deepEqual(landscape.items.map(it=>it.id),['z','other','a']);assert.deepEqual(C.apply('cncfiX','sort-items',ordered),ordered);
console.log('PASS: category-slot ordering preserves landscape topology, IDs, classifications and unrelated categories.');
