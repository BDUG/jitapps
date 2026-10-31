const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/ui.js','utf8');
const functions=source.slice(source.indexOf('function filterLogRow('),source.indexOf('filter.onchange=filterLog;'));
function setup(){
 const controls={'#ag-log-filter':{value:'all'},'#ag-log-search':{value:''},'#ag-log':{children:[]}};
 const context=vm.createContext({$:id=>controls[id],logPayloads:new WeakMap()});
 vm.runInContext(functions,context);
 return {controls,context};
}
function row(kind,text){return {dataset:{kind},textContent:text,hidden:false};}
test('activity filters retain actions, failure receipts and case-insensitive search',()=>{
 const {controls,context}=setup();
 const entries=[row('action','write_file'),row('observation','{"exitCode": 2}'),row('protocol_error','Invalid plan'),row('assistant','Planning')];
 controls['#ag-log'].children=entries;
 controls['#ag-log-filter'].value='errors';context.filterLog();
 assert.deepEqual(entries.map(x=>x.hidden),[true,false,false,true]);
 controls['#ag-log-filter'].value='actions';controls['#ag-log-search'].value='WRITE';context.filterLog();
 assert.deepEqual(entries.map(x=>x.hidden),[false,true,true,true]);
 controls['#ag-log-filter'].value='all';controls['#ag-log-search'].value='';context.filterLog();
 assert.ok(entries.every(x=>!x.hidden));
});
test('appending an unfiltered event never scans prior rows or reads payload text',()=>{
 const {controls,context}=setup();
 controls['#ag-log'].children=new Proxy([],{get(){throw Error('Existing log scanned');}});
 const entry={dataset:{kind:'observation'},get textContent(){throw Error('Unnecessary payload scan');}};
 context.filterLogRow(entry);
 assert.equal(entry.hidden,false);
});

test('search and errors include collapsed receipt payloads',()=>{
 const {controls,context}=setup(),entry=row('observation','Tool observed');
 context.logPayloads.set(entry,'{"exitCode": 7, "stdout": "Hidden diagnostic"}');
 controls['#ag-log'].children=[entry];controls['#ag-log-filter'].value='errors';context.filterLog();assert.equal(entry.hidden,false);
 controls['#ag-log-search'].value='hidden diagnostic';context.filterLog();assert.equal(entry.hidden,false);
});
