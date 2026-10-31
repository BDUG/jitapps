const assert=require('node:assert/strict'),{chromium}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{const folder=await fs.mkdtemp(path.join(os.tmpdir(),'content-hub-')),child=spawn('python3',['server/server.py','--port','0','--config',path.join(folder,'providers.json'),'--search-config',path.join(folder,'search.json'),'--skills-offline','--disable-agent'],{cwd:path.resolve(__dirname,'..'),stdio:['ignore','pipe','pipe']});let browser,stderr='';child.stderr.on('data',d=>stderr+=d);try{const base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error(stderr||'Startup timeout')),15000);child.stdout.on('data',d=>{text+=d;const m=text.match(/listening on (\S+)/);if(m){clearTimeout(timer);resolve('http://'+m[1]);}});child.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const p=await browser.newPage({viewport:{width:1450,height:1050}}),errors=[];let aiCalls=0;p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/chat',async r=>{aiCalls++;await r.abort();});const cases=[['architex','component-color'],['graphiX','scale-proof-strokes'],['textiX','table-header-scope'],['sheetiX','compact-empty-cells'],['codeiX','gitattributes'],['appiX','screen-headings'],['automatextiX','workflow-grid'],['reportiX','source-index-brief'],['presentiX','deck-background'],['sketchiX','connection-weight'],['mindiX','assign-topic-owner'],['projectiX','project-phase'],['vidiX','left-align-layers'],['photiX','soften-photo-edits'],['designiX','text-line-height'],['colabriX','board-snap-grid'],['sketchiX/sketch.html','control-point-grid'],['sketchiX/shape.html','control-point-grid']];
for(const [route,id]of cases){
await p.goto(base+'/'+route+(route.endsWith('.html')?'':'/'));
await p.waitForFunction(()=>window.SuiteToolActions&&window.SuiteWorkspaceAdapter&&!SuiteWorkspaceAdapter.isBusy());
await p.evaluate(async()=>{const A=SuiteWorkspaceAdapter,d=A.snapshot(),tool=A.name;
if(tool==='architex')d.metamodel.components.forEach(c=>c.color='#000000');
if(tool==='graphiX')d.svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect id="kept" width="100" height="100" stroke="#000000"/></svg>';
if(tool==='textiX')d.html='<table><tr><th>Header</th><th scope="row">Keep row</th></tr><tr><td>Value</td><td>Other</td></tr></table>';
if(tool==='sheetiX'){d.sheets[0].cells.A1={value:''};d.sheets[0].cells.B1={value:'',style:{bold:true}};d.sheets[0].cells.C1={value:'=1+1'};}
if(tool==='codeiX')d.files=d.files.filter(f=>f.path!=='.gitattributes');
if(tool==='appiX'){d.designer=AppixDesigner.starter();d.designer.nodes=d.designer.nodes.filter(n=>n.type!=='heading');}
if(tool==='automatextiX')d.nodes.forEach(n=>{n.x=113;n.y=117;});
if(tool==='reportiX')d.library=[{id:'S1',title:'Collected evidence',url:'https://example.test/source',text:'Evidence body'}];
if(tool==='presentiX')d.slides.forEach(s=>s.background='#ffffff');
if(tool==='sketchiX')d.edges.forEach(e=>e.width=1);
if(tool==='mindiX')d.nodes.filter(n=>n.parent).forEach(n=>n.owner='');
if(tool==='vidiX'){d.project=Vidix.starter();d.project.clips[1].locked=true;}
if(tool==='photiX')d.operations=[{type:'brightness',value:160,region:{x:0,y:0,width:d.width,height:d.height},color:'#000000',text:''}];
if(tool==='designiX'){d.brand.headingFont='Georgia';d.brand.bodyFont='Verdana';d.pages[0].elements.push(Designix.element('text',{fontFamily:'Arial',fontWeight:700}));}
if(tool==='colabriX')d.items.push(Colabrix.item('note',{x:113,y:117,name:'Grid fixture'}));
if(tool.startsWith('sketchiX '))d.elements.push(SketchixArtwork.element('rect',[{x:13,y:17},{x:63,y:47}]));
await A.restore(await A.validate(d,A.snapshot()));});
const before=await p.evaluate(()=>SuiteWorkspaceAdapter.snapshot());
await p.evaluate(()=>SuiteToolActions.open());
await p.locator('#sc-actions button[data-action="'+id+'"]').click();
await p.waitForFunction(()=>!document.querySelector('#sw-review').hidden);
assert.deepEqual(await p.evaluate(()=>SuiteWorkspaceAdapter.snapshot()),before,route+' preview is read-only');
await p.locator('#sw-apply').click();await p.waitForFunction(()=>document.querySelector('#sw-status').textContent.startsWith('Updated'));
const after=await p.evaluate(()=>SuiteWorkspaceAdapter.snapshot());assert.notDeepEqual(after,before,route+' applied edit');
const correct=await p.evaluate(id=>{const d=SuiteWorkspaceAdapter.snapshot();
if(id==='component-color')return d.metamodel.components.every(c=>c.color==='#3f6f98');
if(id==='scale-proof-strokes')return d.svg.includes('vector-effect="non-scaling-stroke"')&&d.svg.includes('id="kept"');
if(id==='table-header-scope')return d.html.includes('scope="col"')&&d.html.includes('scope="row"');
if(id==='compact-empty-cells')return !d.sheets[0].cells.A1&&d.sheets[0].cells.B1.style.bold&&d.sheets[0].cells.C1.value==='=1+1';
if(id==='gitattributes')return d.files.some(f=>f.path==='.gitattributes');
if(id==='screen-headings')return d.designer.screens.every(s=>d.designer.nodes.some(n=>n.screen===s.id&&n.type==='heading'));
if(id==='workflow-grid')return d.nodes.every(n=>n.x===120&&n.y===120);
if(id==='source-index-brief')return d.brief.includes('S1')&&d.library[0].text==='Evidence body';
if(id==='deck-background')return d.slides.every(s=>s.background==='#fafafa');
if(id==='connection-weight')return d.edges.every(e=>e.width===3);
if(id==='assign-topic-owner')return d.nodes.filter(n=>n.parent).every(n=>n.owner==='Team');
if(id==='project-phase')return d.tasks[0].name==='Project phase'&&d.tasks[0].summary;
if(id==='left-align-layers')return d.project.clips[0].x===0&&d.project.clips[1].x===160;
if(id==='soften-photo-edits')return d.operations[0].value===130;
if(id==='text-line-height')return d.pages[0].elements.at(-1).lineHeight===1.4;
if(id==='board-snap-grid')return d.items.find(e=>e.name==='Grid fixture').x===120;
if(id==='control-point-grid')return d.elements.at(-1).points[0].x===10;
return false;},id);assert.ok(correct,route);assert.equal(aiCalls,0);
}
assert.deepEqual(errors,[]);console.log('PASS native refinements: every document app and both artwork variants, native validation, actual preview/apply, preserved data, locks, formulas and no AI requests.');
}finally{if(browser)await browser.close();child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)r();else child.once('exit',r);});await fs.rm(folder,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
