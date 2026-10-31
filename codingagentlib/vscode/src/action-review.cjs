'use strict';
const crypto=require('node:crypto');
function mode(value='run'){if(!['run','per-action'].includes(value))throw Error('Command review must be run or per-action');return value;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function fingerprint(action){return crypto.createHash('sha256').update(JSON.stringify(canonical({tool:action.tool,args:action.args,checks:action.checks??null}))).digest('hex');}
function terminal(action){return ['run_command','run_script'].includes(action?.tool);}
function workflow(action){return ['workflow_run','workflow_continue'].includes(action?.tool);}
function preview(action,workspace){const text=JSON.stringify({workspace,tool:action.tool,arguments:action.args,checks:action.checks??null,note:action.tool==='run_script'?'Native runtime inserts the managed script path before additional interpreter arguments. Script contents and invoked programs require separate review.':'Literal native tool arguments; native permissions and schema validation remain authoritative.'},null,2);return {text,fingerprint:fingerprint(action),large:text.length>6000,detail:text.length>6000?text.slice(0,6000)+'\n[Preview abbreviated. Open the full proposal before approval.]':text};}
function pauseReason(action,decision,reviewMode,permissions={}){if(reviewMode!=='per-action'||!action||!terminal(action)&&!workflow(action))return null;if(workflow(action))return 'workflow_requires_individual_steps';if(permissions.allowCommands!==true)return 'commands_disabled';if(decision?.approved!==true)return ['declined','preview_requested'].includes(decision?.reason)?decision.reason:'review_required';if(decision.fingerprint!==fingerprint(action))return 'reviewed_action_changed';return null;}
module.exports={mode,fingerprint,terminal,workflow,preview,pauseReason};
