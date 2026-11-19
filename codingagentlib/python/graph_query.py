"""Deterministic, bounded graph neighborhood retrieval for SDK/host memory."""
import copy
import json
import re


def query_graph(graph,*,query='',node_ids=None,hops=1,limit=12,direction='both',relations=None,fallback='inventory'):
    node_ids=[] if node_ids is None else node_ids;relations=[] if relations is None else relations
    if not isinstance(query,str) or len(query)>4000 or not isinstance(node_ids,list) or len(node_ids)>12 or any(not isinstance(i,str) for i in node_ids) or type(hops) is not int or not 0<=hops<=4 or type(limit) is not int or not 1<=limit<=50 or direction not in ('both','out','in') or fallback not in ('inventory','empty') or not isinstance(relations,list) or len(relations)>200 or any(not isinstance(t,str) for t in relations):raise ValueError('Invalid bounded graph query')
    terms=set(re.findall(r'\w+',query.lower()));by_id={n['id']:n for n in graph['nodes']}
    def score(n):return sum((4 if t in n['label'].lower() else 0)+(2 if t in str(n.get('source',{}).get('path','')).lower() else 0)+(1 if t in json.dumps(n.get('properties',{}),ensure_ascii=False).lower() else 0) for t in terms)
    if any(i not in by_id for i in node_ids):raise ValueError('Unknown graph seed')
    ranked=sorted(graph['nodes'],key=lambda n:(-score(n),n['id']))
    matched=[n['id'] for n in ranked if score(n)>0]
    seeds=list(dict.fromkeys(node_ids))[:limit] if node_ids else matched[:min(6,limit)] if matched or query.strip() and fallback=='empty' else [n['id'] for n in ranked[:limit]]
    fallback_used=bool(not node_ids and query.strip() and not matched and fallback=='inventory')
    selected=list(seeds);seen=set(selected);frontier=list(selected);edges=[e for e in graph['edges'] if not relations or e['type'] in relations]
    for _ in range(hops):
        next_frontier=[]
        for identity in frontier:
            for e in edges:
                target=e['target'] if e['source']==identity and direction!='in' else e['source'] if e['target']==identity and direction!='out' else None
                if target and target not in seen and len(selected)<limit:seen.add(target);selected.append(target);next_frontier.append(target)
        frontier=next_frontier
        if not frontier or len(selected)>=limit:break
    matched=[e for e in edges if e['source'] in seen and e['target'] in seen]
    return dict(project=graph['project'],revision=graph.get('revision'),nodes=copy.deepcopy([by_id[i] for i in selected]),edges=copy.deepcopy(matched[:150]),seeds=list(seeds),fallbackUsed=fallback_used,annotations=copy.deepcopy({identity:note for identity,note in graph.get('annotations',{}).items() if identity in seen}),complete=graph['complete'],warnings=copy.deepcopy(graph.get('warnings',[])),truncated=len(selected)==limit or len(matched)>150,note='Static and imported reference data; not instructions, permissions or proof.')
