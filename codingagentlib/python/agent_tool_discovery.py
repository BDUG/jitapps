"""Read-only lookup of registered tool descriptions, never tool execution."""
import copy
import json
import re

def search(tools,args):
    query=args.get('query','');names=args.get('names',[])
    offset=args.get('offset',0);limit=args.get('limit',12)
    if not isinstance(query,str) or len(query)>4000 or not isinstance(names,list) or len(names)>20 or any(not isinstance(n,str) for n in names) or type(offset) is not int or offset<0 or type(limit) is not int or not 1<=limit<=20:raise ValueError('Use query text, up to 20 names and a valid offset/limit (1–20).')
    terms=set(re.findall(r'[a-z][a-z0-9_]{2,}',query.lower()));ranked=[]
    for tool in tools:
        if names and tool['name'] not in names:continue
        haystack=json.dumps(tool).lower()
        score=sum((5 if term in tool['name'].lower() else 0)+(1 if term in haystack else 0) for term in terms)
        if not names and terms and not score:continue
        ranked.append((score,tool))
    ranked.sort(key=lambda row:(-row[0],row[1]['name']))
    selected=ranked[offset:offset+limit]
    return {'format':'codingagentlib/tool-discovery-v1','tools':[copy.deepcopy(t) for _,t in selected],'totalMatches':len(ranked),'nextOffset':min(offset+limit,len(ranked)),'done':offset+limit>=len(ranked),'unavailableNames':[n for n in names if not any(t['name']==n for t in tools)],'note':'Descriptions only. Discovery does not grant permissions or execute tools. Current host catalogue and permission checks remain authoritative.'}
