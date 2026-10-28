"""Non-executable postconditions over actual JSON tool results (RFC 6901 paths)."""
import math
import json
import re


def json_value(value):
    if value is None or isinstance(value,(str,bool,int)):return True
    if isinstance(value,float):return math.isfinite(value)
    if isinstance(value,list):return all(json_value(v) for v in value)
    if isinstance(value,dict):return all(isinstance(k,str) and json_value(v) for k,v in value.items())
    return False


def validate(checks):
    if checks is None:return []
    if not isinstance(checks,list):raise ValueError('Action checks must be an array')
    for check in checks:
        if not isinstance(check,dict) or check.get('op') not in ('equals','contains','exists'):raise ValueError('Check op must be equals, contains or exists')
        path=check.get('path')
        if not isinstance(path,str) or (path and not path.startswith('/')) or re.search(r'~(?![01])',path):raise ValueError('Check path must be an RFC 6901 JSON pointer')
        if 'value' not in check or not json_value(check['value']):raise ValueError('Check needs a finite JSON value')
        if check['op']=='exists' and not isinstance(check['value'],bool):raise ValueError('exists check value must be boolean')
        if 'label' in check and not isinstance(check['label'],str):raise ValueError('Check label must be text')
    return checks


def equal(a,b):
    if isinstance(a,bool) or isinstance(b,bool):return type(a) is type(b) and a==b
    if isinstance(a,(int,float)) and isinstance(b,(int,float)):return a==b
    if type(a) is not type(b):return False
    if isinstance(a,dict):return a.keys()==b.keys() and all(equal(a[k],b[k]) for k in a)
    if isinstance(a,list):return len(a)==len(b) and all(equal(x,y) for x,y in zip(a,b))
    return a==b


def lookup(result,path):
    if path=='':return True,result
    current=result
    for token in path[1:].split('/'):
        token=token.replace('~1','/').replace('~0','~')
        if isinstance(current,dict) and token in current:current=current[token]
        elif isinstance(current,list) and re.fullmatch(r'0|[1-9][0-9]*',token) and len(token)<20 and int(token)<len(current):current=current[int(token)]
        else:return False,None
    return True,current


def evaluate(result,checks):
    results=[]
    for check in validate(checks):
        exists,actual=lookup(result,check['path']);op=check['op'];expected=check['value']
        passed=exists==expected if op=='exists' else exists and (equal(actual,expected) if op=='equals' else isinstance(actual,str) and isinstance(expected,str) and expected in actual or isinstance(actual,list) and any(equal(v,expected) for v in actual))
        results.append({'path':check['path'],'op':op,'label':check.get('label',check['path'] or '(result root)'),'expected':expected,'exists':exists,'passed':bool(passed),'note':'Evaluated against the actual tool result; no code or expressions executed.'})
    return {'passed':all(r['passed'] for r in results),'results':results}


def history(events):
    """Latest checked result per exact tool/argument pair, never a model claim."""
    actions={};latest={};pending=None
    for event in events:
        value=event.get('value',{})
        if event['kind']=='action':actions[value.get('id')]=value
        if event['kind']=='assistant' and value.get('status')=='act':pending=value.get('action')
        if event['kind']!='observation':continue
        action=actions.get(value.get('id'))
        if action is None and pending and pending.get('tool')==value.get('tool'):action=pending
        pending=None
        if not isinstance(value.get('checks'),dict):continue
        args=action.get('args',{}) if action else {}
        key=json.dumps({'tool':value.get('tool'),'args':args},sort_keys=True,separators=(',',':'),ensure_ascii=False)
        latest[key]={'id':value.get('id'),'tool':value.get('tool'),'passed':value.get('ok') is not False and value['checks'].get('passed') is True}
    failures=[value for value in latest.values() if not value['passed']]
    return {'passed':not failures if latest else None,'unresolved':failures}
