const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./workspace-core.js');
// Previous JSON-based behavior is the compatibility contract for saved reviews.
function reference(before,after){const changes=[];function walk(a,b,path){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(Object.hasOwn(a,key)?a[key]:undefined,Object.hasOwn(b,key)?b[key]:undefined,[...path,key]);}else changes.push({path:path.join('.'),segments:path,before:a,after:b});}walk(before,after,[]);return changes;}
test('single-pass diff preserves exact paths, ordering and values across varied JSON documents',()=>{
 let seed=47;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 function value(depth=0){if(depth>3||random(3)===0)return [null,true,false,'Text.'+random(20),random(100)][random(5)];if(random(2))return Array.from({length:random(5)},()=>value(depth+1));return Object.fromEntries(Array.from({length:random(5)},(_,i)=>[['name','a.b','__proto__','nested'][i],value(depth+1)]));}
 for(let i=0;i<300;i++){const before=value(),after=value();assert.deepEqual(C.diff(before,after),reference(before,after));}
});
test('JSON-equivalent leaves, custom serializers and independent path buffers remain compatible',()=>{
 const before={a:NaN,b:undefined,c:{'x.y':'old'}},after={a:null,c:{'x.y':'new'}};
 assert.deepEqual(C.diff(before,after),reference(before,after));
 const custom={toJSON(){return 'same';},name:'old'},updated={toJSON(){return 'same';},name:'new'};
 assert.deepEqual(C.diff(custom,updated),[]);
 const changes=C.diff({a:1,b:2},{a:3,b:4});assert.deepEqual(changes.map(change=>change.segments),[['a'],['b']]);
});
