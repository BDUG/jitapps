const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function panel(initial={}){
 const ids=new Map(),posted=[];let saved=initial,receive;
 class Element{constructor(){this.children=[];this.value='';this.textContent='';this.dataset={};}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(){}scrollIntoView(){}focus(){}remove(){}}
 const document={getElementById(id){if(!ids.has(id))ids.set(id,new Element());return ids.get(id);},createElement:()=>new Element(),querySelectorAll:()=>[]};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../media/panel.js'),'utf8'),{JSON,setTimeout,document,window:{addEventListener:(_name,fn)=>receive=fn},acquireVsCodeApi:()=>({getState:()=>saved,setState:value=>saved=JSON.parse(JSON.stringify(value)),postMessage:value=>posted.push(value)})});
 return {q:id=>document.getElementById(id),posted,saved:()=>saved,state:extra=>receive({data:{kind:'state',workspaceKey:'rootA',workspace:'A',session:'s',running:false,...extra}}),event:data=>receive({data})};
}

test('workspace-scoped drafts survive panel reload and history replay',()=>{
 const p=panel();p.state();
 p.q('goal').value='Keep my unsent follow-up';p.q('goal').oninput();
 const next=panel(p.saved());
 next.state({trace:[{kind:'user',text:'Old accepted goal'}]});
 assert.equal(next.q('goal').value,'Keep my unsent follow-up');
 next.state({workspaceKey:'rootB'});assert.equal(next.q('goal').value,'');
 next.q('goal').value='Other root';next.q('goal').oninput();
 next.state({workspaceKey:'rootA'});assert.equal(next.q('goal').value,'Keep my unsent follow-up');
});

test('approval clears only the submitted draft; text typed while running is retained',()=>{
 const p=panel();p.state();
 p.q('goal').value='Original request';p.q('form').onsubmit({preventDefault(){}});
 assert.equal(p.posted.at(-1).command,'run');
 p.q('goal').value='New follow-up typed during approval';p.q('goal').oninput();
 p.event({kind:'user',text:'Original request'});
 assert.equal(p.q('goal').value,'New follow-up typed during approval');
 p.state({running:true,pauseRequested:true});
 assert.equal(p.q('spinner').hidden,false);
 assert.equal(p.q('pause').disabled,true);
 assert.equal(p.q('pause').textContent,'Pausing…');
 p.q('pause').onclick();assert.equal(p.posted.at(-1).command,'pause');
});

test('preparing a run disables duplicate submissions and accepted unchanged goals clear',()=>{
 const p=panel();p.state();
 p.q('goal').value='Send once';p.q('form').onsubmit({preventDefault(){}});
 p.event({kind:'user',text:'Send once'});
 assert.equal(p.q('goal').value,'');assert.equal(p.saved().drafts.rootA,'');
 p.state({preparing:true});assert.equal(p.q('start').disabled,true);
 const before=p.posted.length;p.q('form').onsubmit({preventDefault(){}});
 assert.equal(p.posted.length,before);
});

test('host-saved drafts restore after reopening a panel with no webview state',()=>{
 const p=panel();
 p.state({savedDrafts:{rootA:'Restored after closing'}});
 assert.equal(p.q('goal').value,'Restored after closing');
 assert.equal(p.posted.at(-1).command,'saveDraft');
});

test('provider retries appear in chat and status without altering the draft',()=>{
 const p=panel();p.state();
 p.q('goal').value='Keep this follow-up';p.q('goal').oninput();
 p.event({kind:'providerRetry',attempt:2,total:3,delayMs:1500,text:'Retrying model request. No tool action executed.'});
 assert.equal(p.q('status').textContent,'Model retry 2/3 · waiting 2s');
 assert.equal(p.q('goal').value,'Keep this follow-up');
});

test('tool receipts show a concise outcome and preserve inert data behind inspect',()=>{
 const p=panel();p.state();
 const text='<script>raw-receipt-marker</script>\n'+'large payload '.repeat(200);
 p.event({kind:'result',result:{observation:{id:'call-1',tool:'read_file',ok:true,result:{text}}}});
 const card=p.q('chat').children.at(-1);
 assert.equal(card.children[2].textContent,'read_file · observed');
 const details=card.children[3];
 assert.equal(details.children[0].textContent,'Inspect result');
 assert.equal(details.children[1].textContent,'');
 details.open=true;details.ontoggle();
 assert.equal(JSON.parse(details.children[1].textContent).result.text,text);
 p.event({kind:'result',result:{observation:{tool:'run_command',ok:true,result:{exitCode:1,stderr:'failed check'}}}});
 assert.equal(p.q('chat').children.at(-1).className,'error');
 assert.match(p.q('chat').children.at(-1).children[2].textContent,/needs attention · exit 1/);
});

test('new messages preserve scroll position while reading older messages',()=>{
 const p=panel(),chat=p.q('chat');
 chat.scrollHeight=2000;chat.clientHeight=400;chat.scrollTop=100;
 p.event({kind:'info',text:'New update'});assert.equal(chat.scrollTop,100);
 p.q('latest').onclick();assert.equal(chat.scrollTop,2000);
 chat.scrollTop=1600;p.event({kind:'info',text:'Following latest'});assert.equal(chat.scrollTop,2000);
});

test('keyboard submission respects running guard, IME composition, and completed session state',()=>{
 const p=panel();p.state();
 p.q('goal').value='Continue task';
 const key={key:'Enter',ctrlKey:true,preventDefault(){}};
 p.q('goal').onkeydown({...key,isComposing:true});
 assert.ok(!p.posted.some(m=>m.command==='run'));
 p.q('goal').onkeydown(key);
 assert.equal(p.posted.at(-1).command,'run');assert.equal(p.posted.at(-1).resume,true);
 const n=p.posted.length;p.q('goal').onkeydown(key);assert.equal(p.posted.length,n);
 p.state({sessionStatus:'complete',running:false,preparing:false});
 p.q('goal').value='New request';
 p.q('goal').onkeydown({key:'Enter',metaKey:true,preventDefault(){}});
 assert.equal(p.posted.at(-1).resume,false);
});

test('image and text attachments render as removable chips',()=>{
 const p=panel();
 p.state({attachments:[{name:'notes.txt',kind:'file',characters:12},{name:'shot.png',kind:'image',mimeType:'image/png',bytes:240}]});
 assert.equal(p.q('references').children.length,2);
 p.q('references').children[0].children[1].onclick();
 assert.equal(p.posted.at(-1).command,'removeAttachment');
 assert.equal(p.posted.at(-1).name,'notes.txt');
});

test('clicking a failure opens resolution dialog and questions offer predefined answers',()=>{
 const p=panel();p.state();
 p.event({kind:'error',text:'Invalid graph query'});
 const errCard=p.q('chat').children.at(-1);
 errCard.onclick();
 assert.equal(p.posted.at(-1).command,'resolveFailure');
 assert.equal(p.posted.at(-1).text,'Invalid graph query');
 p.event({kind:'result',result:{question:'Proceed with edit?'}});
 const qCard=p.q('chat').children.at(-1),replies=qCard.children.at(-1);
 assert.equal(replies.children.length,4);
 replies.children[0].onclick();
 assert.equal(p.q('goal').value,'Yes, proceed');
 assert.equal(p.posted.at(-1).command,'run');
 assert.equal(p.posted.at(-1).resume,true);
});

test('sessions drawer lists and switches between saved sessions',()=>{
 const p=panel();p.state({session:'s1'});
 p.q('sessions-drawer').hidden=true;
 p.q('sessions-btn').onclick();
 assert.equal(p.q('sessions-drawer').hidden,false);
 assert.equal(p.posted.at(-1).command,'listSessions');
 p.event({kind:'sessionsList',sessions:[{id:'s1',label:'First goal',description:'paused · 2 steps'},{id:'s2',label:'Second goal',description:'complete · 1 steps'}]});
 assert.equal(p.q('sessions-list').children.length,2);
 p.q('sessions-list').children[1].onclick();
 assert.equal(p.q('sessions-drawer').hidden,true);
 assert.equal(p.posted.at(-1).command,'selectSession');
 assert.equal(p.posted.at(-1).id,'s2');
});

test('one-click copy copies chat message text without triggering failure dialog',async()=>{
 const p=panel();p.state();
 p.event({kind:'error',text:'Copyable failure'});
 const card=p.q('chat').children.at(-1),copyBtn=card.children[1];
 assert.equal(copyBtn.className,'copy-btn');
 let stopped=false;
 await copyBtn.onclick({stopPropagation(){stopped=true;}});
 assert.equal(stopped,true);
 assert.equal(p.posted.at(-1).command,'copyText');
 assert.equal(p.posted.at(-1).text,'Copyable failure');
});

test('snapshots drawer lists snapshots and triggers create, rollback, and delete',()=>{
 const p=panel();p.state();
 p.q('snapshots-drawer').hidden=true;
 p.q('snapshots-btn').onclick();
 assert.equal(p.q('snapshots-drawer').hidden,false);
 assert.equal(p.posted.at(-1).command,'listSnapshots');
 p.q('create-snapshot').onclick();
 assert.equal(p.posted.at(-1).command,'createSnapshot');
 p.event({kind:'snapshotsList',snapshots:[{id:'snap-1',label:'Before edit',fileCount:3,createdAt:new Date().toISOString()}]});
 assert.equal(p.q('snapshots-list').children.length,1);
 const row=p.q('snapshots-list').children[0],acts=row.children[1];
 acts.children[0].onclick();
 assert.equal(p.q('snapshots-drawer').hidden,true);
 assert.equal(p.posted.at(-1).command,'rollbackSnapshot');
 assert.equal(p.posted.at(-1).id,'snap-1');
 acts.children[1].onclick();
 assert.equal(p.posted.at(-1).command,'deleteSnapshot');
 assert.equal(p.posted.at(-1).id,'snap-1');
});
