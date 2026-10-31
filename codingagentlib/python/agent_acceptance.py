"""Run-level acceptance rules, evaluated only from recorded tool observations."""
from . import agent_checks

EDITS={'write_file','replace_text','apply_edits','delete_file','write_script','delete_script','restore_file','apply_project'}
def validate(rules):
    if rules is None:return []
    if not isinstance(rules,list):raise ValueError('Acceptance rules must be an array')
    seen=set();out=[]
    for rule in rules:
        if not isinstance(rule,dict) or any(not isinstance(rule.get(k),str) or not rule[k].strip() for k in ('id','title','tool')):raise ValueError('Each acceptance rule needs id, title and tool')
        if rule['id'] in seen:raise ValueError('Acceptance rule IDs must be unique')
        seen.add(rule['id']);match=agent_checks.validate(rule.get('match',[]));checks=agent_checks.validate(rule.get('checks',[]))
        if not checks:raise ValueError('Each acceptance rule needs at least one result check')
        fresh=rule.get('afterEdits',True)
        if not isinstance(fresh,bool):raise ValueError('afterEdits must be boolean')
        out.append({'id':rule['id'],'title':rule['title'],'tool':rule['tool'],'match':match,'checks':checks,'afterEdits':fresh})
    return out

def evaluate(rules,events):
    rules=validate(rules);actions={};observations=[];last_edit=-1;pending=None
    for index,event in enumerate(events):
        value=event.get('value',{})
        if event['kind']=='action':actions[value.get('id')]=value
        if event['kind']=='assistant' and value.get('status')=='act':pending=value.get('action')
        if event['kind']=='user_action' and value.get('operation') in ('script_write','script_delete','restore_file'):last_edit=index
        if event['kind']=='observation':
            action=actions.get(value.get('id'))
            if action is None and isinstance(pending,dict) and pending.get('tool')==value.get('tool'):action=pending
            observations.append((index,value,action));pending=None
            if value.get('ok') and value.get('tool') in EDITS:last_edit=index
    results=[]
    for rule in rules:
        latest=None
        for index,value,action in reversed(observations):
            if value.get('tool')!=rule['tool']:continue
            if rule['match'] and (not action or action.get('tool')!=rule['tool'] or not agent_checks.evaluate(action.get('args',{}),rule['match'])['passed']):continue
            latest=(index,value);break
        status='pending';checks=None;call_id=None
        if latest:
            index,value=latest;call_id=value.get('id')
            if rule['afterEdits'] and index<last_edit:status='stale'
            elif value.get('ok') is not True:status='failed'
            else:
                checks=agent_checks.evaluate(value.get('result'),rule['checks']);status='passed' if checks['passed'] else 'failed'
        results.append({'id':rule['id'],'title':rule['title'],'tool':rule['tool'],'status':status,'passed':status=='passed','callId':call_id,'checks':checks})
    return {'passed':all(r['passed'] for r in results),'results':results,'note':'Checks use the latest matching recorded tool result. Freshness covers recorded edits only; external changes and requirement adequacy are not independently certified.'}
