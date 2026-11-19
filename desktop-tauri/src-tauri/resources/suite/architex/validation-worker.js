'use strict';
importScripts('validation.js');
// Rules have a detached model snapshot and no access to the editor DOM or storage.
// Disable common network and worker APIs; this is not a security boundary for hostile code.
for(const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','importScripts','indexedDB','caches']){
 try{Object.defineProperty(self,name,{value:undefined,writable:false,configurable:false});}catch{}
}
self.onmessage=event=>{
 const {model,rule}=event.data;
 const issues=ArchitexValidation.runRule(model,rule,api=>new Function('api','"use strict";\n'+rule.source)(api));
 self.postMessage({issues});
};
