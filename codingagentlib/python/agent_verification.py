"""Bind command evidence to known inspected/edited workspace files and managed scripts."""
import hashlib
import copy
import json
import os
import stat

MAX_FILES=256
MAX_FILE_BYTES=2_000_000
NOTE=('Hashes cover known inspected/edited workspace files and managed scripts, not every dependency or command-side effect. '
      'Matching hashes establish input continuity, not test adequacy, hermeticity or an atomic snapshot. '
      'Changed inputs require fresh verification; never replay a command automatically.')

def targets(runtime,session,extra=()):
    result={('workspace',p) for p in session.get('backups',{})}
    actions={}
    for event in session.get('events',[]):
        v=event.get('value',{})
        if event['kind']=='action':actions[v.get('id')]=v
        if event['kind']=='user_action' and v.get('operation') in {'script_write','script_delete'} and isinstance(v.get('path'),str):result.add(('script',v['path']))
        if event['kind']=='observation' and v.get('ok') is True:
            action=actions.get(v.get('id'),{})
            if action.get('tool') in {'read_file','write_file','replace_text','apply_edits','delete_file','restore_file','read_script','write_script','delete_script'} and isinstance(action.get('args',{}).get('path'),str):result.add(('script' if action['tool'] in {'read_script','write_script','delete_script'} else 'workspace',action['args']['path']))
    for row in [*session.get('verificationBinding',{}).get('files',[]),*extra]:
        if row.get('kind') in {'workspace','script'} and isinstance(row.get('path'),str):result.add((row['kind'],row['path']))
    return sorted(result)

def capture(runtime,session,extra=()):
    paths=targets(runtime,session,extra);files=[];warnings=[]
    if len(paths)>MAX_FILES:warnings.append({'reason':'input_count_limit','total':len(paths),'limit':MAX_FILES})
    for kind,path in paths[:MAX_FILES]:
        try:
            base=session['_dir']/'scripts' if kind=='script' else None
            if base is not None and base.is_symlink():raise ValueError('Symlink script root')
            target=runtime.path(path,base=base)
            try:
                fd=os.open(target,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0)|getattr(os,'O_NONBLOCK',0))
            except FileNotFoundError:
                files.append({'kind':kind,'path':path,'hash':'missing'});continue
            with os.fdopen(fd,'rb') as stream:
                info=os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_size>MAX_FILE_BYTES:raise ValueError('Unsupported verification input')
                data=stream.read(MAX_FILE_BYTES+1)
                if len(data)>MAX_FILE_BYTES:raise ValueError('Verification input grew beyond budget')
            files.append({'kind':kind,'path':path,'hash':hashlib.sha256(data).hexdigest()})
        except (OSError,ValueError):warnings.append({'kind':kind,'path':path,'reason':'unavailable'})
    return {'files':files,'complete':not warnings,'warnings':warnings}

def changes(before,after):
    old={(r['kind'],r['path']):r['hash'] for r in before['files']}
    new={(r['kind'],r['path']):r['hash'] for r in after['files']}
    return [{'kind':k[0],'path':k[1],'expectedHash':old.get(k),'actualHash':new.get(k)} for k in sorted(set(old)|set(new)) if old.get(k)!=new.get(k)]

def record(runtime,session,before,result):
    after=capture(runtime,session,before['files']);changed=changes(before,after)
    successful=result['exitCode']==0 and not result.get('timedOut') and not result.get('cancelled')
    binding={'format':'codingagentlib/verification-binding/v1','jobId':result['jobId'],'successful':successful,
             'stable':before['complete'] and after['complete'] and not changed,**after,'changedDuringCommand':changed}
    binding['inputDigest']=hashlib.sha256(json.dumps(after['files'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    session['verificationBinding']=copy.deepcopy(binding)
    result['verificationBinding']={'inputDigest':binding['inputDigest'],'inputs':after['files'],'stable':binding['stable'],'complete':after['complete'],'boundFiles':len(after['files']),'changedDuringCommand':changed,'warnings':before['warnings']+after['warnings'],'note':NOTE}

def freshness(runtime,session):
    binding=session.get('verificationBinding')
    if not binding:return {'format':'codingagentlib/verification-freshness/v1','status':'none','passed':False,'trackedFiles':0,'changed':[],'note':NOTE}
    current=capture(runtime,session,binding['files']);changed=changes(binding,current)
    status='failed' if not binding['successful'] else 'unavailable' if not binding['complete'] or not current['complete'] else 'stale' if not binding['stable'] or changed else 'current' if binding['files'] else 'unbound'
    return {'format':'codingagentlib/verification-freshness/v1','status':status,'passed':status in {'current','unbound'},'jobId':binding['jobId'],
            'inputDigest':binding.get('inputDigest'),'trackedFiles':len(binding['files']),'changed':changed or binding['changedDuringCommand'],'warnings':current['warnings'],'note':NOTE}
