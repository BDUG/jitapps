"""Audited browser-editor actions; validation/application occur in the active editor."""
import re
from . import agent_checks

NAMES={'read_current_project','apply_project'}
def observation(s,id):
    return next((e['value'] for e in reversed(s['events']) if e['kind']=='observation' and e['value'].get('id')==id),None)
def begin(runtime,s,data):
    runtime.check(s);name=data.get('tool');id=data.get('callId');args=data.get('args',{});checks=agent_checks.validate(data.get('checks'))
    if name not in NAMES or not isinstance(args,dict) or not isinstance(id,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',id):raise ValueError('Invalid editor action')
    if data.get('currentTool')!=s['tool']:raise ValueError('Saved session belongs to another app; start a run in this app')
    if not s.get('allowProjectContext'):raise PermissionError('Current-project context is disabled for this run')
    if name=='apply_project' and not (s.get('allowProjectEdits') and s['allowEdits']):raise PermissionError('Direct project edits are disabled for this run')
    with s['_lock']:
        completed=observation(s,id)
        if completed:return {'complete':{k:v for k,v in completed.items() if k not in ('id','tool')}}
        if id in s.get('projectCalls',{}):
            pending=s['projectCalls'][id]
            if pending['tool']!=name or pending['args']!=args:raise ValueError('Different editor action already uses this call ID')
            return {'pending':pending}
        if s['_running']:raise ValueError('A tool is already running')
        current=max((e['index'] for e in s['events'] if e['kind']=='user' and isinstance(e.get('value'),dict) and e['value'].get('status')=='follow_up'),default=-1)
        if data.get('expectedUserRevision',current)!=current:return {'steeringChanged':True}
        if name=='apply_project' and args.get('expectedSnapshot')!=s.get('contextSnapshot'):raise ValueError('Stale project snapshot; read_current_project before editing')
        if id in s['_calls']:raise ValueError('Tool call ID was already used')
        pending={'tool':name,'args':args,'checks':checks,'userRevision':current}
        s.setdefault('projectCalls',{})[id]=pending;s['_calls'].add(id);s['_running']=True;s['_activeCall']=id
        runtime.event(s,'action',{'id':id,'tool':name,'args':args,**({'taskId':data['taskId']} if data.get('taskId') else {}),**({'checks':checks} if checks else {})})
        return {'pending':pending}
def finish(runtime,s,data):
    id=data.get('callId')
    with s['_lock']:
        old=observation(s,id)
        if old:return {k:v for k,v in old.items() if k not in ('id','tool')}
        pending=s.get('projectCalls',{}).get(id)
        if not pending:raise ValueError('No pending editor action')
        result=data.get('result');error=data.get('error')
        if error is not None:
            if not isinstance(error,str):raise ValueError('Editor error must be text')
            response={'ok':False,'error':error}
        else:
            if not isinstance(result,dict) or result.get('tool')!=s['tool'] or result.get('status')!=('applied' if pending['tool']=='apply_project' else 'read') or result.get('source')!='browser editor' or result.get('snapshot')!=s.get('contextSnapshot'):raise ValueError('Editor result needs its archived current snapshot')
            response={'ok':True,'result':result}
            if pending['checks']:response['checks']=agent_checks.evaluate(result,pending['checks'])
        runtime.event(s,'observation',{'id':id,'tool':pending['tool'],**response});s['projectCalls'].pop(id,None)
        if s.get('_activeCall')==id:s['_running']=False;s['_activeCall']=None
        runtime.persist(s);return response
