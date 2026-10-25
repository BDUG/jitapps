"""Freshness-bound independent-review checkpoints; never executes reviewer suggestions."""
import hashlib
import json
import uuid
from . import agent_planning

def checksum(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def state(runtime,session,workspace=None):
    scripts=[]
    for path in sorted((session['_dir']/'scripts').rglob('*')):
        if path.is_file() and not path.is_symlink():scripts.append([str(path.relative_to(session['_dir']/'scripts')),hashlib.sha256(path.read_bytes()).hexdigest()])
    events=[e for e in session['events'] if e['kind'] in {'user','observation','user_action'}]
    return checksum({'workspace':runtime.manifest() if workspace is None else workspace,'scripts':scripts,'events':events,'tasks':agent_planning.latest(session['events']),'contextSnapshot':session.get('contextSnapshot')})
def validate_result(value,review_id,session_id):
    if not isinstance(value,dict) or value.get('reviewId')!=review_id or value.get('sessionId')!=session_id or value.get('verdict') not in {'approve','revise'} or not isinstance(value.get('summary'),str) or not value['summary'].strip() or len(value['summary'])>10000:raise ValueError('Reviewer needs matching IDs, approve/revise verdict and summary')
    findings=value.get('findings',[])
    if not isinstance(findings,list) or len(findings)>30:raise ValueError('Reviewer allows up to 30 findings')
    normalized=[]
    for finding in findings:
        if not isinstance(finding,dict) or finding.get('severity') not in {'error','warning','info'} or not isinstance(finding.get('message'),str) or not finding['message'].strip() or len(finding['message'])>10000:raise ValueError('Invalid reviewer finding')
        item={'severity':finding['severity'],'message':finding['message']}
        if 'path' in finding:
            if not isinstance(finding['path'],str) or len(finding['path'])>512:raise ValueError('Invalid finding path')
            item['path']=finding['path']
        if 'line' in finding:
            if type(finding['line']) is not int or finding['line']<1:raise ValueError('Invalid finding line')
            item['line']=finding['line']
        normalized.append(item)
    if value['verdict']=='approve' and any(f['severity']=='error' for f in normalized):raise ValueError('An approval cannot include error findings')
    return {'reviewId':review_id,'sessionId':session_id,'verdict':value['verdict'],'summary':value['summary'],'findings':normalized}
def prepare(runtime,session,data):
    runtime.check(session)
    with session['_lock']:
        if session['_running']:raise ValueError('Wait for the active tool before independent review')
        candidate=data.get('candidate')
        if not isinstance(candidate,dict) or not isinstance(candidate.get('summary'),str) or not isinstance(candidate.get('verification',[]),list):raise ValueError('Provide the proposed completion summary and verification')
        candidate={'summary':candidate['summary'],'verification':candidate.get('verification',[]),'outcome':candidate.get('outcome','complete')}
        manifest=runtime.manifest();changes=[{'path':path,'status':'added' if path not in session['initial'] else 'deleted' if path not in manifest else 'modified','hash':manifest.get(path,{}).get('hash','missing'),'bytes':manifest.get(path,{}).get('bytes',0)} for path in sorted(set(manifest)|set(session['initial'])) if manifest.get(path)!=session['initial'].get(path)]
        checkpoint={'id':uuid.uuid4().hex,'state':state(runtime,session,manifest),'candidate':candidate};session['independentCheckpoint']=checkpoint;runtime.persist(session)
        observations=[e['value'] for e in session['events'] if e['kind']=='observation'];commands=[{'id':o.get('id'),'tool':o.get('tool'),'ok':o.get('ok'),'checks':o.get('checks'),'result':o.get('result')} for o in observations if o.get('tool') in {'run_command','run_script'}]
        return {'protocol':'suite-agent-review/v1','reviewId':checkpoint['id'],'sessionId':session['id'],'goal':session['goal'],'userInstructions':[e['value'] for e in session['events'] if e['kind']=='user'],'candidate':candidate,'tasks':agent_planning.latest(session['events']),'changes':changes,'commands':commands,'inspections':[{'id':o.get('id'),'tool':o.get('tool'),'ok':o.get('ok'),'result':o.get('result')} for o in observations if o.get('tool') in {'read_file','search','list_files','read_command_output'} or o.get('tool','').startswith('code_')][-20:],'checks':[{'id':o.get('id'),'tool':o.get('tool'),'ok':o.get('ok'),'checks':o['checks']} for o in observations if o.get('checks')],'scripts':runtime.execute(session,'list_scripts',{})['scripts'],'contextSnapshot':session.get('contextSnapshot'),'coverage':{'commandOutputs':'retained previews; outputPaged indicates more output','inspections':'latest 20 source/navigation observations; paging flags describe incomplete reads','originalFiles':'file-tool recovery copies where available; command-only originals may be unavailable'}}
def submit(runtime,session,data):
    runtime.check(session)
    with session['_lock']:
        checkpoint=session.get('independentCheckpoint')
        if not checkpoint or data.get('reviewId')!=checkpoint['id']:raise ValueError('Prepare a fresh independent review first')
        if checkpoint['state']!=state(runtime,session):raise ValueError('Workspace, instructions or project changed during independent review; prepare again')
        result=validate_result(data.get('result'),checkpoint['id'],session['id']);result['state']=checkpoint['state'];result['candidate']=checkpoint['candidate'];previous=next((e['value'] for e in reversed(session['events']) if e['kind']=='independent_review' and e['value'].get('reviewId')==checkpoint['id']),None)
        if previous:
            if previous!=result:raise ValueError('Different verdict already recorded for this review')
            return previous
        runtime.event(session,'independent_review',result);return result

def require_approval(runtime,session,data):
    if not session.get('independentReview') or data.get('outcome','complete')!='complete':return
    result=next((e['value'] for e in reversed(session['events']) if e['kind']=='independent_review'),None)
    if not result or result.get('verdict')!='approve':raise ValueError('Independent review must approve before complete; inspect findings or finish partial/blocked')
    if result['state']!=state(runtime,session):raise ValueError('Independent approval is stale; review the current state again')
    candidate={'summary':str(data.get('summary','')),'verification':data.get('verification',[]),'outcome':data.get('outcome','complete')}
    if candidate!=result['candidate']:raise ValueError('Completion differs from the independently reviewed summary')
