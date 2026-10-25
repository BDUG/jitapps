"""Versioned, workspace-local tool workflows. Definitions are data, not Python/shell code."""
from contextlib import closing
import copy
import json
from pathlib import Path
import re
import sqlite3
import time
import uuid
from . import agent_checks
from .agent_skills import page_int

STEP_TOOLS={'list_files','read_file','search','write_file','replace_text','delete_file','restore_file','list_scripts','write_script','read_script','delete_script','run_command','run_script','read_command_output','changes'}
TYPES={'string':lambda v:isinstance(v,str),'number':lambda v:isinstance(v,(int,float)) and not isinstance(v,bool),'boolean':lambda v:isinstance(v,bool),'object':lambda v:isinstance(v,dict),'array':lambda v:isinstance(v,list)}
def identifier(value):
    if not isinstance(value,str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}',value):raise ValueError('Use an ID with letters, digits, underscores or hyphens (1–80 characters)')
    return value

def references(value,inputs,steps):
    if isinstance(value,list):
        for item in value:references(item,inputs,steps)
    elif isinstance(value,dict):
        if '$input' in value:
            if set(value)!={'$input'} or not isinstance(value['$input'],str) or value['$input'] not in inputs:raise ValueError('Unknown input reference')
        elif '$step' in value:
            if set(value)-{'$step','path'} or not isinstance(value['$step'],str) or value['$step'] not in steps:raise ValueError('Step references must identify an earlier step')
            agent_checks.validate([{'path':value.get('path',''),'op':'exists','value':True}])
        else:
            for item in value.values():references(item,inputs,steps)

def validate(value):
    if not isinstance(value,dict) or value.get('format')!='suite-tool-workflow/v1':raise ValueError('Use a suite-tool-workflow/v1 definition')
    for key in ('name','description'):
        if not isinstance(value.get(key),str) or not value[key].strip():raise ValueError('Workflow needs a name and description')
    inputs=value.get('inputs',{})
    if not isinstance(inputs,dict):raise ValueError('Workflow inputs must be an object')
    for name,spec in inputs.items():
        identifier(name)
        if not isinstance(spec,dict) or not isinstance(spec.get('type'),str) or spec.get('type') not in TYPES or 'required' in spec and not isinstance(spec['required'],bool):raise ValueError('Input needs a JSON type and optional required boolean')
        if 'default' in spec and (not agent_checks.json_value(spec['default']) or not TYPES[spec['type']](spec['default'])):raise ValueError('Input default does not match its type')
    steps=value.get('steps')
    if not isinstance(steps,list) or not steps:raise ValueError('Workflow needs a nonempty steps array')
    seen=set()
    for step in steps:
        if not isinstance(step,dict):raise ValueError('Workflow step must be an object')
        ident=identifier(step.get('id'))
        if ident in seen:raise ValueError('Workflow step IDs must be unique')
        if not isinstance(step.get('tool'),str) or step.get('tool') not in STEP_TOOLS or not isinstance(step.get('args'),dict):raise ValueError('Unsupported workflow step tool or arguments')
        references(step['args'],inputs,seen);agent_checks.validate(step.get('checks',[]));references(step.get('checks',[]),inputs,seen);seen.add(ident)
    if not agent_checks.json_value(value):raise ValueError('Workflow must contain finite JSON data')
    return copy.deepcopy({k:value[k] for k in ('format','name','description','inputs','steps') if k in value})

def resolve(value,inputs,results):
    if isinstance(value,list):return [resolve(v,inputs,results) for v in value]
    if isinstance(value,dict):
        if set(value)=={'$input'}:
            if not isinstance(value['$input'],str) or value['$input'] not in inputs:raise ValueError('Missing referenced input: '+value['$input'])
            return copy.deepcopy(inputs[value['$input']])
        if '$step' in value:
            if value['$step'] not in results:raise ValueError('Referenced step has no successful result')
            exists,result=agent_checks.lookup(results[value['$step']],value.get('path',''))
            if not exists:raise ValueError('Referenced result path does not exist')
            return copy.deepcopy(result)
        return {k:resolve(v,inputs,results) for k,v in value.items()}
    return value

class Workflows:
    def __init__(self,path):
        self.path=Path(path)
        if self.path.is_symlink():raise ValueError('Workflows database cannot be a symlink')
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with closing(self.connect()) as db,db:db.execute('CREATE TABLE IF NOT EXISTS revisions (id TEXT, revision INTEGER, record TEXT, PRIMARY KEY(id,revision))')
        self.path.chmod(0o600)
    def connect(self):return sqlite3.connect(self.path,timeout=15)
    def read(self,id,revision=None):
        identifier(id)
        if revision is not None:revision=page_int(revision,None,1,2**31)
        with closing(self.connect()) as db:row=db.execute('SELECT record FROM revisions WHERE id=?'+(' AND revision=?' if revision else ' ORDER BY revision DESC LIMIT 1'),(id,revision) if revision else (id,)).fetchone()
        if not row:raise ValueError('Workflow revision not found')
        return json.loads(row[0])
    def history(self,args):
        ident=identifier(args.get('id'));cursor=page_int(args.get('cursor'),0,0,2**31);limit=page_int(args.get('limit'),20,1,100)
        with closing(self.connect()) as db:
            total=db.execute('SELECT COUNT(*) FROM revisions WHERE id=?',(ident,)).fetchone()[0]
            rows=db.execute('SELECT record FROM revisions WHERE id=? ORDER BY revision DESC LIMIT ? OFFSET ?',(ident,limit,cursor)).fetchall()
        if not total:raise ValueError('Workflow not found')
        records=[]
        for row in rows:
            record=json.loads(row[0]);definition=record.pop('definition');record.update(name=definition['name'],steps=len(definition['steps']));records.append(record)
        return {'id':ident,'revisions':records,'total':total,'nextCursor':min(cursor+limit,total),'done':cursor+limit>=total}
    def compare(self,args):
        if args.get('fromRevision') is None or args.get('toRevision') is None:raise ValueError('Choose two explicit workflow revisions')
        before=self.read(args.get('id'),args['fromRevision']);after=self.read(args.get('id'),args['toRevision']);changes=[]
        def walk(a,b,path=''):
            if type(a) is type(b) and isinstance(a,dict):
                for key in sorted(set(a)|set(b)):
                    pointer=path+'/'+key.replace('~','~0').replace('/','~1')
                    if key not in a:changes.append({'path':pointer,'kind':'added','after':b[key]})
                    elif key not in b:changes.append({'path':pointer,'kind':'removed','before':a[key]})
                    else:walk(a[key],b[key],pointer)
            elif type(a) is not type(b) or a!=b:changes.append({'path':path,'kind':'changed','before':a,'after':b})
        walk({'enabled':before['enabled'],'definition':before['definition']},{'enabled':after['enabled'],'definition':after['definition']})
        return {'id':before['id'],'fromRevision':before['revision'],'toRevision':after['revision'],'changes':changes,'note':'Read-only comparison. Restoring stages an old definition; save creates a new revision.'}
    def save(self,s,args):
        id=identifier(args.get('id'));expected=page_int(args.get('expectedRevision'),None,0,2**31)
        if expected is None:raise ValueError('Provide expectedRevision (0 for a new workflow)')
        definition=validate(args.get('definition'));enabled=args.get('enabled',True)
        if not isinstance(enabled,bool):raise ValueError('enabled must be boolean')
        ids=args.get('evidenceCallIds',[])
        if not isinstance(ids,list) or any(not isinstance(v,str) for v in ids):raise ValueError('evidenceCallIds must be strings')
        observations={e['value'].get('id'):(i,e['value']) for i,e in enumerate(s['events']) if e['kind']=='observation'}
        if any(v not in observations for v in ids):raise ValueError('Evidence must reference recorded observations in this session')
        evidence=[{'callId':id,'tool':observations[id][1]['tool'],'ok':observations[id][1].get('ok'),'exitCode':observations[id][1].get('result',{}).get('exitCode'),'checksPassed':observations[id][1].get('checks',{}).get('passed')} for id in ids]
        observed=len(ids)==len(definition['steps']) and len(set(ids))==len(ids) and all(observations[ids[i]][0]<observations[ids[i+1]][0] for i in range(len(ids)-1)) and all(success(observations[id][1]) and observations[id][1]['tool']==step['tool'] for id,step in zip(ids,definition['steps']))
        with closing(self.connect()) as db,db:
            db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT MAX(revision) FROM revisions WHERE id=?',(id,)).fetchone();latest=row[0] or 0
            if latest!=expected:raise ValueError('Stale workflow revision; read the latest before saving')
            record={'id':id,'revision':latest+1,'enabled':enabled,'definition':definition,'sourceSession':s['id'],'updatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'evidence':evidence,'evidenceStatus':'observed-sequence' if observed else 'definition-only','note':'Historical evidence, not certification for new inputs or environments.'}
            db.execute('INSERT INTO revisions VALUES (?,?,?)',(id,latest+1,json.dumps(record,ensure_ascii=False,allow_nan=False)))
        return record
    def list(self,args):
        cursor=page_int(args.get('cursor'),0,0,2**31);limit=page_int(args.get('limit'),20,1,100);query=args.get('query','')
        if not isinstance(query,str) or not isinstance(args.get('includeDisabled',False),bool):raise ValueError('Invalid workflow query')
        with closing(self.connect()) as db:rows=db.execute('SELECT r.record FROM revisions r JOIN (SELECT id,MAX(revision) AS revision FROM revisions GROUP BY id) c ON r.id=c.id AND r.revision=c.revision').fetchall()
        terms=set(re.findall(r'\w+',query.lower()));records=[]
        for row in rows:
            r=json.loads(row[0]);d=r.pop('definition');r.update(name=d['name'],description=d['description'],steps=len(d['steps']))
            if not r['enabled'] and not args.get('includeDisabled',False):continue
            score=len(terms&set(re.findall(r'\w+',r['id'].lower()+' '+r['name'].lower()+' '+r['description'].lower())))
            if terms and not score:continue
            r['score']=score;records.append(r)
        records.sort(key=lambda r:(-r['score'],r['id']));return {'workflows':records[cursor:cursor+limit],'total':len(records),'nextCursor':min(len(records),cursor+limit),'done':cursor+limit>=len(records)}

def prepare_inputs(definition,provided):
    if not isinstance(provided,dict) or set(provided)-set(definition.get('inputs',{})):raise ValueError('Unknown workflow inputs')
    values={}
    for name,spec in definition.get('inputs',{}).items():
        if name in provided:values[name]=provided[name]
        elif 'default' in spec:values[name]=copy.deepcopy(spec['default'])
        elif spec.get('required',False):raise ValueError('Missing workflow input: '+name)
        if name in values and (not agent_checks.json_value(values[name]) or not TYPES[spec['type']](values[name])):raise ValueError('Input type mismatch: '+name)
    return values

def preflight(runtime,s,args):
    definition=validate(args.get('definition'));inputs=prepare_inputs(definition,args.get('inputs',{}));steps=[]
    edit_tools={'write_file','replace_text','delete_file','restore_file','write_script','delete_script'}
    for step in definition['steps']:
        issues=[];dynamic=False
        def has_result(v):
            return isinstance(v,dict) and ('$step' in v or any(has_result(i) for i in v.values())) or isinstance(v,list) and any(has_result(i) for i in v)
        dynamic=has_result(step['args'])
        if step['tool'] in edit_tools and not s['allowEdits']:issues.append('File/script edit permission is disabled')
        if step['tool'] in {'run_command','run_script'}:
            if not s['allowCommands']:issues.append('Command permission is disabled')
            key='command'
            value=step['args'].get(key)
            if not has_result(value):
                executable=resolve(value,inputs,{})
                if not isinstance(executable,str) or executable not in runtime.allowed:issues.append('Executable is not on the runtime allowlist: '+str(executable))
            else:issues.append('Executable depends on an earlier result; allowlist checked at execution')
        steps.append({'id':step['id'],'tool':step['tool'],'usesEarlierResults':dynamic,'issues':issues})
    return {'inputs':inputs,'steps':steps,'permissionsReady':not any(step['issues'] for step in steps),'note':'No steps executed. Static permission/allowlist review only; paths, hashes, program availability and dynamic arguments must still be checked during execution.'}

def success(response):
    result=response.get('result',{})
    return response.get('ok') is True and response.get('checks',{}).get('passed') is not False and not result.get('timedOut') and not result.get('cancelled') and ('exitCode' not in result or result['exitCode']==0)
def revision(s):return max((e['index'] for e in s['events'] if e['kind']=='user' and e['value'].get('status')=='follow_up'),default=-1)
def summary(run):return {k:copy.deepcopy(run[k]) for k in ('runId','id','revision','status','nextStep','totalSteps','steps','reason')}
def run(runtime,s,args,continuing=False):
    budget=page_int(args.get('maxSteps'),4,1,16)
    if continuing:
        execution=s.get('workflowRuns',{}).get(args.get('runId'))
        if not execution or execution['status']!='paused':raise ValueError('Only a paused workflow can continue; inspect failed/interrupted work before starting a new execution')
    else:
        id=identifier(args.get('id'));rev=page_int(args.get('revision'),None,1,2**31)
        if rev is None:raise ValueError('Pin the workflow revision after reading it')
        if not any(e['kind']=='observation' and e['value'].get('ok') and e['value'].get('tool')=='workflow_read' and e['value'].get('result',{}).get('id')==id and e['value']['result'].get('revision')==rev for e in s['events']):raise ValueError('Read this workflow revision in the current session before executing it')
        record=runtime.workflows.read(id,rev)
        if not record['enabled'] or not runtime.workflows.read(id)['enabled']:raise ValueError('Workflow is disabled')
        definition=validate(record['definition']);provided=args.get('inputs',{})
        values=prepare_inputs(definition,provided)
        execution={'runId':uuid.uuid4().hex,'id':id,'revision':rev,'definition':definition,'inputs':copy.deepcopy(values),'results':{},'steps':[],'status':'paused','nextStep':0,'totalSteps':len(definition['steps']),'reason':'Ready','activeStep':None}
        s.setdefault('workflowRuns',{})[execution['runId']]=execution
    if not runtime.workflows.read(execution['id'])['enabled']:raise ValueError('Workflow is disabled')
    execution['status']='running';execution['reason']='Executing';user_revision=revision(s);runtime.persist(s)
    for _ in range(budget):
        if s['_cancel'].is_set():execution.update(status='cancelled',reason='Run stopped; inspect side effects before restarting');break
        if revision(s)!=user_revision:execution.update(status='paused',reason='New user instructions; replan before continuing');break
        try:enabled=runtime.workflows.read(execution['id'])['enabled']
        except (ValueError,OSError,sqlite3.Error) as error:
            execution.update(status='failed',reason='Workflow library unavailable: '+str(error));break
        if not enabled:execution.update(status='paused',reason='Workflow disabled before next step');break
        if execution['nextStep']>=execution['totalSteps']:execution.update(status='complete',reason='All declared steps succeeded');break
        step=execution['definition']['steps'][execution['nextStep']];call_id='wf_'+execution['runId']+'_'+str(execution['nextStep'])
        try:
            runtime.check(s);a=resolve(step['args'],execution['inputs'],execution['results']);checks=agent_checks.validate(resolve(step.get('checks',[]),execution['inputs'],execution['results']))
            with s['_lock']:
                if call_id in s['_calls']:raise ValueError('Workflow step call was already reserved; refusing replay')
                s['_calls'].add(call_id);execution['activeStep']=call_id;runtime.persist(s)
            response=runtime.perform(s,step['tool'],a,call_id,checks)
        except (ValueError,PermissionError,OSError,TypeError,KeyError) as error:
            execution.update(status='failed',reason=str(error));break
        execution['steps'].append({'id':step['id'],'callId':call_id,'tool':step['tool'],'ok':success(response)})
        execution['activeStep']=None
        if not success(response):execution.update(status='cancelled' if response.get('result',{}).get('cancelled') else 'failed',reason=response.get('error') or 'Step failed, timed out, was cancelled or failed declared checks');runtime.persist(s);break
        execution['results'][step['id']]=response['result'];execution['nextStep']+=1;runtime.persist(s)
    if execution['status']=='running':execution.update(status='complete' if execution['nextStep']==execution['totalSteps'] else 'paused',reason='All declared steps succeeded' if execution['nextStep']==execution['totalSteps'] else 'Workflow batch finished; inspect results before continuing')
    runtime.persist(s);return summary(execution)

def recover(s):
    for run in s.get('workflowRuns',{}).values():
        if run['status']=='running':run.update(status='interrupted',reason='Server restarted during execution. Inspect child observations and side effects; no step was replayed.')
