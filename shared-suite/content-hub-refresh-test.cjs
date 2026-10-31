const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/content-hub-ui.js','utf8');
const refresh=source.slice(source.indexOf('async function refresh()'),source.indexOf('function snapshot()'));
function setup(){
 const nodes=new Map();
 const q=id=>{if(!nodes.has(id))nodes.set(id,{value:'',children:[],setAttribute(key,value){this[key]=value;},replaceChildren(...children){this.children=children;this.firstChild=children[0];},append(child){this.children.push(child);}});return nodes.get(id);};
 const pending=[];
 const context=vm.createContext({q,make:()=>({}),status:()=>{},T:{list:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))},render:()=>{}});
 vm.runInContext('let serial=0,records=[],recordIndex=new Map(),browseRows=[],checked=new Set(["gone","new"]);'+refresh,context);
 return {context,q,pending};
}
test('refresh indexes current records and ignores out-of-order storage results',async()=>{
 const {context,q,pending}=setup();
 const old=context.refresh(),current=context.refresh();
 assert.equal(q('ch-list')['aria-busy'],'true');assert.equal(q('ch-refresh').disabled,true);
 pending[1].resolve([{id:'new',name:'Current',tags:[],document:{sourceTool:'textiX',text:'Search me'}}]);await current;
 pending[0].resolve([]);await old;
 assert.equal(vm.runInContext('recordIndex.get("new").name',context),'Current');
 assert.equal(vm.runInContext('browseRows[0].text',context),'Search me');
 assert.equal(vm.runInContext('checked.has("gone")',context),false);
 assert.equal(vm.runInContext('checked.has("new")',context),true);
 assert.equal(q('ch-list')['aria-busy'],'false');assert.equal(q('ch-refresh').disabled,false);
});
test('failed refresh releases loading controls',async()=>{
 const {context,q,pending}=setup();const request=context.refresh();
 pending[0].reject(Error('Storage unavailable'));
 await assert.rejects(request,/Storage unavailable/);
 assert.equal(q('ch-list')['aria-busy'],'false');assert.equal(q('ch-refresh').disabled,false);
});
