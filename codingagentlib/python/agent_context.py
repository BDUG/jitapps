"""Lossless session archives behind compressed model context; no executable content."""
import hashlib
import json
import re
import uuid
from . import agent_checks

# At most one decoded snapshot per runtime; never reuse it without rehashing bytes.
CACHE_BYTES=8000000
RENDERED_PATHS=4


def number(value,default=0,maximum=2**53-1):
    if value is None:return default
    if isinstance(value,bool) or not isinstance(value,int) or not 0<=value<=maximum:raise ValueError('Invalid context offset/length')
    return value


def folder(runtime,s):
    path=runtime.path('contexts',base=s['_dir'],private=True);path.mkdir(exist_ok=True,mode=0o700);return path


def upload_path(runtime,s,id):
    if not isinstance(id,str) or not re.fullmatch(r'[a-f0-9]{32}',id):raise ValueError('Invalid context upload ID')
    return runtime.path('upload-'+id+'.tmp',base=folder(runtime,s),private=True)


def begin(runtime,s):
    runtime.enabled();id=uuid.uuid4().hex
    with upload_path(runtime,s,id).open('xb'):pass
    return {'upload':id,'offset':0}


def append(runtime,s,data):
    runtime.enabled();text=data.get('text');offset=number(data.get('offset'))
    if not isinstance(text,str) or not text or len(text)>64000:raise ValueError('Send a nonempty context chunk up to 64,000 characters')
    path=upload_path(runtime,s,data.get('upload'))
    with s['_lock'],path.open('r+b') as stream:
        stream.seek(0,2)
        if stream.tell()!=offset:raise ValueError('Context upload offset changed; start a new upload')
        stream.write(text.encode('utf-8'));return {'upload':data['upload'],'offset':stream.tell()}


def signature(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(65536),b''):digest.update(chunk)
    return digest.hexdigest()


def invalid_constant(value):raise ValueError('App context must use finite JSON values')

def commit(runtime,s,data):
    runtime.enabled();path=upload_path(runtime,s,data.get('upload'))
    with s['_lock']:
        raw=path.read_bytes()
        if len(raw)!=number(data.get('bytes')):raise ValueError('Context upload byte count does not match')
        value=json.loads(raw.decode('utf-8'),parse_constant=invalid_constant)
        digest=hashlib.sha256(raw).hexdigest();destination=runtime.path(digest+'.json',base=folder(runtime,s),private=True)
        if destination.exists():
            if signature(destination)!=digest:raise ValueError('Archived context content was changed')
        else:runtime.write(destination,raw)
        path.unlink()
        if len(raw)<=CACHE_BYTES:runtime._context_cache={'key':(s['id'],digest),'value':value,'rendered':{}}
        result={'snapshot':digest,'bytes':len(raw),'source':'browser app context, not runtime workspace files'}
        s['contextSnapshot']=digest;runtime.event(s,'user_action',{'operation':'context_snapshot',**result});return result


def page(value,pointer,args,rendered=None):
    agent_checks.validate([{'path':pointer,'op':'exists','value':True}])
    exists,selected=agent_checks.lookup(value,pointer)
    if not exists:raise ValueError('Context/history path does not exist')
    text=rendered.get(pointer) if rendered is not None else None
    if text is None:
        text=selected if isinstance(selected,str) else json.dumps(selected,ensure_ascii=False,indent=2)
        if rendered is not None and len(text)<=CACHE_BYTES:
            while rendered and (len(rendered)>=RENDERED_PATHS or sum(map(len,rendered.values()))+len(text)>CACHE_BYTES):rendered.pop(next(iter(rendered)))
            rendered[pointer]=text
    offset=number(args.get('offset'));limit=number(args.get('limit'),12000,64000)
    if limit<1:raise ValueError('Context page size must be positive')
    end=min(len(text),offset+limit)
    return {'path':pointer,'text':text[offset:end],'offset':offset,'nextOffset':end,'totalCharacters':len(text),'done':end>=len(text),'valueType':'string' if isinstance(selected,str) else 'json'}


def history(runtime,s,args):
    with s['_lock']:
        if args.get('index') is None:
            cursor=number(args.get('cursor'));limit=number(args.get('limit'),20,100)
            if limit<1:raise ValueError('History page size must be positive')
            events=s['events'];items=[{'index':e['index'],'kind':e['kind'],'time':e['time'],**{k:e['value'][k] for k in ('step','tool','id') if isinstance(e.get('value'),dict) and k in e['value']}} for e in events[cursor:cursor+limit]]
            return {'events':items,'total':len(events),'nextCursor':min(len(events),cursor+limit),'done':cursor+limit>=len(events)}
        index=number(args['index'])
        if index>=len(s['events']):raise ValueError('History event was not found')
        event=s['events'][index];return {'eventIndex':index,'kind':event['kind'],**page(event,args.get('path',''),args)}


class SnapshotMissing(ValueError):
    def __init__(self,digest):
        self.snapshot=digest
        super().__init__('App-context snapshot '+digest+' is unavailable in this session. Restore the exact retained browser context, or use read_current_project to archive the current editor and use its returned snapshot. Do not create the missing file manually, guess another hash, or substitute newer content for this historical snapshot.')


def read(runtime,s,args):
    digest=args.get('snapshot',s.get('contextSnapshot'))
    if not isinstance(digest,str) or not re.fullmatch(r'[a-f0-9]{64}',digest):raise ValueError('No valid app-context snapshot; include app context when starting/resuming')
    path=runtime.path(digest+'.json',base=folder(runtime,s),private=True)
    try:raw=path.read_bytes()
    except FileNotFoundError:raise SnapshotMissing(digest) from None
    if hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('Archived app context has changed')
    cached=runtime._context_cache
    if cached is None or cached['key']!=(s['id'],digest):
        value=json.loads(raw.decode('utf-8'),parse_constant=invalid_constant)
        cached={'key':(s['id'],digest),'value':value,'rendered':{}}
        if len(raw)<=CACHE_BYTES:runtime._context_cache=cached
    return {'snapshot':digest,'source':'browser app context, not runtime workspace files',**page(cached['value'],args.get('path',''),args,cached['rendered'] if len(raw)<=CACHE_BYTES else None)}
