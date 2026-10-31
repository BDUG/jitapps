"""Bounded independent read-only workspace sensing, with audited child receipts."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re

ALLOWED={'read_file','list_files','search'}

def run(runtime,session,args,parent_call_id):
    requests=args.get('requests');workers=args.get('workers',4)
    if not isinstance(requests,list) or not 1<=len(requests)<=8 or type(workers) is not int or not 1<=workers<=4:raise ValueError('Provide 1–8 independent read requests and 1–4 workers')
    prepared=[];seen=set()
    for request in requests:
        if not isinstance(request,dict) or not isinstance(request.get('id'),str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,49}',request['id']) or request['id'] in seen or request.get('tool') not in ALLOWED or not isinstance(request.get('args'),dict):raise ValueError('Each read needs a unique ID, object args and read_file/list_files/search; commands, writes and nested batches are forbidden')
        seen.add(request['id']);call_id='read_'+hashlib.sha256((parent_call_id+':'+request['id']).encode()).hexdigest()[:40]
        prepared.append({'id':request['id'],'tool':request['tool'],'args':json.loads(json.dumps(request['args'],allow_nan=False)),'callId':call_id})
    with session['_lock']:
        if any(r['callId'] in session['_calls'] for r in prepared):raise ValueError('A batch child call already exists; inspect retained observations instead of replaying')
        session['_calls'].update(r['callId'] for r in prepared)
    def read(request):
        try:runtime.check(session)
        except PermissionError:
            return {'id':request['id'],'tool':request['tool'],'callId':None,'started':False,'ok':False,'cancelled':True,'error':'Cancelled before this read started'}
        observed=runtime.perform(session,request['tool'],request['args'],request['callId'],parent_call_id=parent_call_id)
        return {'id':request['id'],'tool':request['tool'],'callId':request['callId'],'started':True,**{k:v for k,v in observed.items() if k!='memory'}}
    with ThreadPoolExecutor(max_workers=min(workers,len(prepared)),thread_name_prefix='agent-read') as pool:
        # map preserves request order, while audit order reflects actual execution.
        results=list(pool.map(read,prepared))
    return {'format':'codingagentlib/parallel-read-v1','workers':min(workers,len(prepared)),'results':results,'allSucceeded':all(r['ok'] for r in results),'cancelled':session['_cancel'].is_set(),'note':'Independent reads are not an atomic workspace snapshot. Inspect each hash, paging state and error; no write or command was run by this batch.'}
