const assert=require('node:assert/strict'),L=require('./loop');
const command=(ok,result,tool='run_command')=>({kind:'observation',value:{tool,ok,result}});
const cases=[command(true,{exitCode:0}),command(true,{exitCode:1}),command(false,{exitCode:0}),command(undefined,{exitCode:0}),command(true,{exitCode:false}),command(true,{exitCode:0,timedOut:true}),command(true,{exitCode:0,cancelled:true}),command(true,{}),command(true,{exitCode:0},'run_script')];
const report=L.evidence(cases);assert.equal(report.commands,9);assert.equal(report.passed,2);assert.equal(report.failed,7);assert.equal(report.toolFailures,1);assert.equal(report.latest.tool,'run_script');
const before=JSON.stringify(cases);const withEdit=[...cases,{kind:'observation',value:{tool:'apply_project',ok:true,result:{}}}];assert.equal(L.evidence(withEdit).editsAfterLastCommand,true);assert.equal(L.evidence([...withEdit,command(true,{exitCode:0})]).editsAfterLastCommand,false);assert.equal(JSON.stringify(cases),before);
const failed=L.evidence([command(false,{exitCode:0})]);assert.equal(failed.latest.toolError,true);assert.equal(failed.passed,0);assert.equal(failed.failed,1);assert.match(L.evidenceSummary([command(false,{exitCode:0})]).text,/1 failed/);
assert.equal(L.evidence([]).latest,null);assert.equal(L.evidence([{kind:'observation',value:{tool:'read_file',ok:false,error:'No access'}}]).toolFailures,1);
report.latest.exitCode=99;assert.equal(cases.at(-1).value.result.exitCode,0);
console.log('PASS: exact evidence counts, failed-start/unknown/timeout/cancelled receipts, source immutability, fresh verification after edits and independent latest receipt.');
