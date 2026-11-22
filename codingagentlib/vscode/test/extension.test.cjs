const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
test('VS Code command/panel host approves writes, runs native worker, exports ZIP, and reads settings',async t=>{
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vscode-host-')),frames=[],commands=new Map(),calls=[],secrets=new Map(),provider={endpoint:'http://127.0.0.1:3000/chat',model:'fake',transport:'openai',apiKey:'settings-api-key',executionMode:'build',allowEdits:true,allowCommands:false,allowedCommands:[process.execPath,'nonexistent-command-xyz'],maxSteps:4,requestTimeoutSeconds:10};let receive,approval=false,contentProvider,terminalChoice,largeProposal=false;const terminalDialogs=[],runDialogs=[];
const uri=file=>({scheme:'file',fsPath:file,toString:()=>file});const window={createOutputChannel:()=>({appendLine(){},dispose(){}}),createStatusBarItem:()=>({show(){},dispose(){}}),showWarningMessage:async(title,options,...buttons)=>{if(title==='Review terminal action before execution'){terminalDialogs.push({options,buttons});return terminalChoice;}if(title.startsWith('Reset '))return 'Reset';if(title.startsWith('Roll back '))return 'Rollback';if(title.includes('not in allowedCommands'))return 'Add and retry';if(title.startsWith('Start coding agent in '))runDialogs.push(options.detail);return approval?'Start run':undefined;},showInputBox:async options=>options.value||'ok',showErrorMessage:text=>calls.push({error:text}),showInformationMessage:async()=>{},showOpenDialog:async()=>[uri(path.join(workspace,'reference.txt'))],showSaveDialog:async options=>uri(path.join(workspace,options?.filters?.Markdown?'tasks.md':'result.zip')),showQuickPick:async(items,options)=>options?.canPickMany?[items[0]]:items[0],createWebviewPanel:()=>({webview:{cspSource:'https://extension.test',asWebviewUri:u=>u.fsPath,postMessage:m=>frames.push(m),onDidReceiveMessage:fn=>{receive=fn;return {dispose(){}};}},onDidDispose(){},reveal(){}})};
window.showTextDocument=async document=>calls.push({preview:document});
const vscode={window,workspace:{isTrusted:true,workspaceFolders:[{name:'Test',uri:uri(workspace)}],textDocuments:[],openTextDocument:async uri=>({uri,getText:()=>contentProvider.provideTextDocumentContent(uri)}),saveAll:async()=>true,getConfiguration:()=>({get:(key,fallback)=>provider[key]??fallback,update:async(k,v)=>provider[k]=v}),registerTextDocumentContentProvider:(_scheme,content)=>{contentProvider=content;return {dispose(){}};}},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return {dispose(){}};},executeCommand:async(...args)=>calls.push(args)},Uri:{file:uri,parse:value=>({scheme:'codingagent-snapshot',toString:()=>value}),joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},ViewColumn:{Beside:2},StatusBarAlignment:{Right:1},ConfigurationTarget:{Global:1}};
const storage=new Map();const context={workspaceState:{get:(key,fallback)=>storage.get(key)??fallback,update:async(key,value)=>storage.set(key,value)},subscriptions:[],extensionUri:uri(root),asAbsolutePath:p=>path.join(root,p),secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v),delete:async k=>secrets.delete(k)}};
const workers=[],local=createRequire(path.join(root,'src/extension.cjs')),NativeWorker=local('./worker.cjs').Worker;class TrackedWorker extends NativeWorker{constructor(...args){super(...args);workers.push(this);}}const source=await fs.readFile(path.join(root,'src/extension.cjs'),'utf8'),module={exports:{}};vm.runInNewContext(source,{require:name=>name==='vscode'?vscode:name==='./worker.cjs'?{Worker:TrackedWorker}:local(name),module,exports:module.exports,process,AbortSignal,URL,console},{filename:'extension.cjs'});
await fs.writeFile(path.join(workspace,'reference.txt'),'explicit reference marker');
vscode.languages={getDiagnostics:()=>[[uri(path.join(workspace,'reference.txt')),[{message:'Current editor diagnostic',severity:1,range:{start:{line:0,character:1},end:{line:0,character:2}}}]]]};
const previous=global.fetch;global.fetch=async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer settings-api-key');const request=JSON.parse(JSON.parse(options.body).messages[1].content);if(request.goal.startsWith('Inspect paged mention')){const refs=request.events.filter(e=>e.kind==='user'&&e.value?.status==='reference_files').flatMap(e=>e.value.attachments||[]),paged=refs.filter(a=>a.path==='large.txt');if(request.goal.includes('#page=2')){assert.equal(paged.length,1);assert.equal(paged[0].page,1);assert.equal(paged[0].content,'B'.repeat(12000));assert.equal(paged[0].totalPages,3);}else{assert.equal(paged.length,0);assert.match(request.goal,/Could not attach/);}return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({sessionId:request.sessionId,step:request.step,status:'done',plan:'Inspected reference',summary:'Reference checked without edits',action:null})},finish_reason:'stop'}]}));}if(request.goal==='Run unallowlisted sh'){const observed=request.events.some(e=>e.kind==='observation');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({sessionId:request.sessionId,step:request.step,status:observed?'done':'act',plan:'Run sh',summary:'Sh ran',action:observed?null:{tool:'run_command',args:{command:'sh',args:['-c','echo allowlist-ok']}}})},finish_reason:'stop'}]}));}
if(request.goal==='Generate retained output'){const observed=request.events.some(e=>e.kind==='observation');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({sessionId:request.sessionId,step:request.step,status:observed?'done':'act',plan:'Generate one output',summary:'Output retained',action:observed?null:{tool:'run_command',args:{command:process.execPath,args:['-e',"process.stdout.write('host output marker')"+(largeProposal?';/*'+'x'.repeat(6500)+'*/':'')]}}})},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}));}assert.equal(request.ideContext.diagnostics[0].path,'reference.txt');assert.equal(request.ideContext.diagnostics[0].message,'Current editor diagnostic');const observed=request.events.some(e=>e.kind==='observation');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({sessionId:request.sessionId,step:request.step,status:observed?'done':'act',plan:'Write requested file',tasks:[{id:'write',title:'Write greeting',status:observed?'done':'in_progress'}],summary:'Written',action:observed?null:{tool:'write_file',args:{path:'hello.txt',content:'VS Code native run',expectedHash:'missing'}}})},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}));};
t.after(async()=>{global.fetch=previous;await module.exports.deactivate();await fs.rm(workspace,{recursive:true,force:true});});
module.exports.activate(context);await commands.get('codingagent.open')();receive({command:'ready'});
assert.equal(commands.size,7);
await commands.get('codingagent.settings')();
assert.ok(calls.some(c=>Array.isArray(c)&&c[0]==='workbench.action.openSettings'&&c[1]==='codingagent'));

// Attach a file via the chat attachFile message, run, and verify attachments clear per run.
receive({command:'attachFile'});
const attachUntil=Date.now()+3000;while(!frames.filter(f=>f.kind==='state').at(-1)?.attachments?.length){if(Date.now()>attachUntil)throw Error('Attach timed out');await new Promise(r=>setTimeout(r,10));}
assert.equal(frames.filter(f=>f.kind==='state').at(-1).attachments[0].name,'reference.txt');

// Without an additional "Start run" modal dialog, allowEdits=true from Settings writes directly and exports ZIP.
receive({command:'run',goal:'Write hello'});
const until=Date.now()+10000;while(!frames.some(f=>f.kind==='status'&&f.text==='complete')||frames.filter(f=>f.kind==='state').at(-1)?.preparing){if(Date.now()>until)throw Error('Run timed out: '+JSON.stringify(frames));await new Promise(r=>setTimeout(r,20));}
assert.equal(runDialogs.length,0);
assert.equal(frames.filter(f=>f.kind==='state').at(-1).attachments.length,0);
assert.equal(await fs.readFile(path.join(workspace,'hello.txt'),'utf8'),'VS Code native run');
await commands.get('codingagent.package')();
assert.deepEqual([...(await fs.readFile(path.join(workspace,'result.zip'))).subarray(0,2)],[80,75]);
assert.ok(!JSON.stringify(frames).includes('Authorization'));
assert.ok(!frames.some(f=>f.kind==='error'));

// Workspace-scoped draft persistence.
const workspaceKey=frames.filter(f=>f.kind==='state').at(-1).workspaceKey;
receive({command:'saveDraft',workspaceKey,text:'Unsent follow-up'});
const savedUntil=Date.now()+2000;while(storage.get('native-drafts')?.[workspaceKey]!=='Unsent follow-up'){if(Date.now()>savedUntil)throw Error('Draft did not persist');await new Promise(r=>setTimeout(r,10));}
receive({command:'ready'});await new Promise(r=>setTimeout(r,10));
assert.equal(frames.filter(f=>f.kind==='state').at(-1).savedDrafts[workspaceKey],'Unsent follow-up');

// Per-action terminal review and preview.
provider.commandReview='per-action';provider.maxRunSeconds=30;
receive({command:'run',goal:'Generate retained output',commands:true});
async function waitFor(predicate){const until=Date.now()+5000;while(!predicate()){if(Date.now()>until)throw Error('Terminal review timed out: '+JSON.stringify(frames.slice(-8)));await new Promise(r=>setTimeout(r,10));}}
await waitFor(()=>frames.some(f=>f.kind==='commandReview'&&f.approved===false)&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.equal(terminalDialogs.length,1);assert.equal(runDialogs.length,0);
terminalChoice='Run action';const beforeResume=frames.filter(f=>f.kind==='status'&&f.text==='complete').length;
receive({command:'run',resume:true,goal:''});
await waitFor(()=>frames.filter(f=>f.kind==='status'&&f.text==='complete').length>beforeResume&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.ok(frames.some(f=>f.kind==='commandReview'&&f.approved===true));

largeProposal=true;terminalChoice='Preview & pause';const beforePreview=terminalDialogs.length;
receive({command:'run',goal:'Generate retained output',commands:true});
await waitFor(()=>terminalDialogs.length>beforePreview&&frames.filter(f=>f.kind==='commandReview').at(-1)?.reason==='preview_requested'&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.deepEqual(terminalDialogs.at(-1).buttons,['Preview & pause']);const preview=calls.find(c=>c.preview)?.preview;assert.ok(preview);assert.ok(preview.getText().includes('x'.repeat(6500)));
terminalChoice='Run action';const beforeLargeResume=frames.filter(f=>f.kind==='status'&&f.text==='complete').length;
receive({command:'run',resume:true,goal:''});
await waitFor(()=>frames.filter(f=>f.kind==='status'&&f.text==='complete').length>beforeLargeResume&&!frames.filter(f=>f.kind==='state').at(-1).preparing);

// Reconnecting a crashed worker restores the saved audit without executing another action.
const previousWorker=workers.at(-1),savedId=frames.filter(f=>f.kind==='state').at(-1).session;
const auditBefore=await previousWorker.dispatch({op:'session',session:savedId});
const exited=new Promise(resolve=>previousWorker.child.once('exit',resolve));previousWorker.child.kill('SIGKILL');await exited;
await commands.get('codingagent.package')();assert.equal(workers.length,2);
const auditAfter=await workers.at(-1).dispatch({op:'session',session:savedId});
assert.deepEqual(auditAfter.events,auditBefore.events);assert.equal(frames.filter(f=>f.kind==='state').at(-1).session,savedId);
receive({command:'newSession'});
await waitFor(()=>frames.some(f=>f.kind==='reset')&&frames.filter(f=>f.kind==='state').at(-1).session==='');
receive({command:'resolveFailure',text:'Invalid graph query'});
await waitFor(()=>frames.filter(f=>f.kind==='state').at(-1).pendingDrafts.some(d=>d.label==='Failure recovery'));
receive({command:'listSessions'});
await waitFor(()=>frames.some(f=>f.kind==='sessionsList'&&f.sessions.some(s=>s.id===savedId)));
receive({command:'selectSession',id:savedId});
await waitFor(()=>frames.filter(f=>f.kind==='state').at(-1).session===savedId);
receive({command:'resetAll'});
await waitFor(()=>frames.some(f=>f.kind==='info'&&f.text==='Agent files and memory reset.'));
await assert.rejects(fs.access(path.join(workspace,'.codingagentlib-rust')));

// Plan mode is enforced by the message/approval host and cannot become Build on Resume.
const beforePlan=await fs.readFile(path.join(workspace,'hello.txt'),'utf8');
receive({command:'run',goal:'Plan source changes',executionMode:'plan',edits:true,commands:true});
await waitFor(()=>frames.some(f=>f.kind==='status'&&f.text==='paused · plan_action_blocked')&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.equal(runDialogs.length,0);
const blockedCount=frames.filter(f=>f.kind==='status'&&f.text==='paused · plan_action_blocked').length;
receive({command:'run',resume:true,goal:'Continue planning',executionMode:'build',edits:true,commands:true});
await waitFor(()=>frames.filter(f=>f.kind==='status'&&f.text==='paused · plan_action_blocked').length>blockedCount&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.equal(frames.filter(f=>f.kind==='state').at(-1).sessionMode,'plan');assert.equal(await fs.readFile(path.join(workspace,'hello.txt'),'utf8'),beforePlan);

// Exercise composer parsing, host resolution and the real native reference transport together.
await fs.writeFile(path.join(workspace,'large.txt'),'A'.repeat(12000)+'B'.repeat(12000)+'C'.repeat(12000));
for(const selector of ['2','0','999']){
 const completeBefore=frames.filter(f=>f.kind==='status'&&f.text==='complete').length;
 receive({command:'run',goal:'Inspect paged mention @file:large.txt#page='+selector,executionMode:'plan'});
 await waitFor(()=>frames.filter(f=>f.kind==='status'&&f.text==='complete').length>completeBefore&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
}
// Goals longer than 4000 characters must not trigger "Invalid graph query" in next().
const longGoal='Inspect paged mention @file:large.txt#page=2 '+'Long specification '.repeat(260);
const beforeLong=frames.filter(f=>f.kind==='status'&&f.text==='complete').length;
receive({command:'run',goal:longGoal,executionMode:'plan'});
await waitFor(()=>frames.filter(f=>f.kind==='status'&&f.text==='complete').length>beforeLong&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.ok(!frames.some(f=>f.kind==='error'&&String(f.text).includes('Invalid graph query')));

// Unallowlisted command prompts to add to allowedCommands and retries seamlessly.
provider.commandReview='run';
const workersBeforeAdd=workers.length,completeBeforeAdd=frames.filter(f=>f.kind==='status'&&f.text==='complete').length;
receive({command:'run',goal:'Run unallowlisted sh',commands:true});
await waitFor(()=>frames.filter(f=>f.kind==='status'&&f.text==='complete').length>completeBeforeAdd&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.ok(provider.allowedCommands.includes('sh'));
assert.ok(workers.length>workersBeforeAdd);

// Manual snapshot creation and rollback restore workspace files.
await fs.writeFile(path.join(workspace,'snap-check.txt'),'before-snap');
receive({command:'createSnapshot',label:'Manual check'});
await waitFor(()=>frames.some(f=>f.kind==='snapshotsList'&&f.snapshots.some(s=>s.label==='Manual check')));
const snapId=frames.filter(f=>f.kind==='snapshotsList').at(-1).snapshots.find(s=>s.label==='Manual check').id;
await fs.writeFile(path.join(workspace,'snap-check.txt'),'after-snap');
receive({command:'rollbackSnapshot',id:snapId});
await waitFor(()=>frames.some(f=>f.kind==='info'&&String(f.text).includes('Rolled back workspace')));
assert.equal(await fs.readFile(path.join(workspace,'snap-check.txt'),'utf8'),'before-snap');

// /goal keeps goal text clean, activates implementer + Goal mode instructions, and completes in Build mode.
const beforeGoal=frames.filter(f=>f.kind==='status'&&f.text==='complete').length;
receive({command:'run',goal:'/goal Inspect paged mention @file:large.txt#page=2',executionMode:'plan'});
await waitFor(()=>frames.filter(f=>f.kind==='status'&&f.text==='complete').length>beforeGoal&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
assert.ok(frames.some(f=>f.kind==='info'&&String(f.text).includes('Goal mode (500 steps)')));
assert.ok(frames.some(f=>f.kind==='user'&&f.text.startsWith('Inspect paged mention @file:large.txt#page=2')&&!f.text.includes('[Autonomous Goal Mode]')));

// /status, /snapshots, and /new work as instant slash commands.
receive({command:'run',goal:'/status',resume:true});
await waitFor(()=>frames.some(f=>f.kind==='info'&&String(f.text).includes('Allowed commands:'))&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
receive({command:'run',goal:'/changes',resume:true});
await waitFor(()=>frames.some(f=>f.kind==='info'&&/workspace changes/i.test(String(f.text)))&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
receive({command:'run',goal:'/snapshots'});
await waitFor(()=>frames.some(f=>f.kind==='info'&&String(f.text).includes('Saved snapshots:'))&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
receive({command:'run',goal:'/new'});
await waitFor(()=>frames.filter(f=>f.kind==='state').at(-1).session===''&&!frames.filter(f=>f.kind==='state').at(-1).preparing);
});
