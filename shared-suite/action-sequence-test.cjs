'use strict';
const assert=require('node:assert/strict');
const {sequence,validate}=require('./action-presets.js');
(async()=>{
 const actions=[{id:'append'}], document={text:'A'};
 const config={format:'tlal-editing-presets/v1',app:'test',presets:[
 {id:'one',name:'First',action:'append',value:'B',includeInSequence:true},
 {id:'skip',name:'Skipped',action:'append',value:'X'},
 {id:'two',name:'Second',action:'append',value:'C',includeInSequence:true}]};
 const original=JSON.stringify(config);let validations=0;
 const apply=(_app,_action,doc,value)=>{doc.text+=value;return doc;};
 const check=async(doc,before)=>{validations++;assert.equal(doc.text.slice(0,-1),before.text);return doc;};
 assert.deepEqual(await sequence('test',config,actions,document,apply,check),{text:'ABC'});
 assert.equal(validations,2);assert.deepEqual(document,{text:'A'});assert.equal(JSON.stringify(config),original);
 const reversed={...config,presets:[...config.presets].reverse()};
 assert.deepEqual(await sequence('test',reversed,actions,document,apply,async d=>d),{text:'ACB'});
 await assert.rejects(sequence('test',config,actions,document,apply,async d=>{if(d.text==='ABC')throw Error('Invalid document');return d;}),/Step 2 \(Second\): Invalid document/);
 assert.deepEqual(document,{text:'A'});
 await assert.rejects(sequence('test',{...config,presets:[]},actions,document,apply,check),/Select at least one/);
 assert.equal(validate('test',config,actions).presets[1].includeInSequence,false);
 console.log('PASS: ordered, selected, immutable editing sequences with per-step validation and atomic failure.');
})().catch(e=>{console.error(e);process.exitCode=1;});
