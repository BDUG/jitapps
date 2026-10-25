"""Read-only, revision-guarded workspace change review and single-file patches."""
import difflib
import hashlib


def digest(data):return hashlib.sha256(data).hexdigest()
def read(runtime,session,data,live=False):
    if session['_running'] and not live:raise ValueError('Wait for the active tool before reviewing changes')
    path=runtime.path(data.get('path'));relative=str(path.relative_to(runtime.root))
    if path.is_dir():raise ValueError('Choose a changed file, not a directory')
    current=path.read_bytes() if path.exists() else None;current_hash=digest(current) if current is not None else 'missing'
    if data.get('expectedHash')!=current_hash:raise ValueError('File changed after the change list was loaded. Refresh artifacts and review again')
    initial=session['initial'].get(relative)
    if (initial is None and current is None) or (initial and current_hash==initial['hash']):raise ValueError('This file no longer differs from the session baseline')
    backup=session['backups'].get(relative);before=None;kind='unavailable';note='No recovery copy is available for this workspace change. The original text cannot be reconstructed.'
    if backup:
        if backup['existed']:
            source=runtime.path(backup['id'],base=runtime.path('backups',base=session['_dir'],private=True),private=True)
            if source.is_file():before=source.read_bytes();kind='recovery';note='Recovery copy captured before the first file-tool edit. Earlier command or external edits may already be present in it.'
            else:note='The recorded recovery copy is missing. Original text is unavailable.'
        else:before=b'';kind='absent';note='The file was absent before its first file-tool edit.'
    elif initial is None:before=b'';kind='absent';note='The file was absent from the initial session manifest.'
    before_hash=digest(before) if before is not None else 'unavailable'
    if 'expectedBeforeHash' in data and data['expectedBeforeHash']!=before_hash:raise ValueError('Recovery copy changed during review. Close and reopen the change')
    return {'path':relative,'status':'added' if initial is None else 'deleted' if current is None else 'modified','hash':current_hash,'beforeHash':before_hash,'baselineKind':kind,'baselineNote':note},before,current

def text(data):
    if data is None:return None,False
    try:
        value=data.decode('utf-8')
        if '\0' in value:return None,True
        return value,False
    except UnicodeDecodeError:return None,True

def preview(runtime,session,data,live=False):
    info,before,after=read(runtime,session,data,live=live);offset=data.get('offset',0);limit=data.get('limit',12000)
    if not isinstance(offset,int) or isinstance(offset,bool) or not 0<=offset<=2**53-1 or not isinstance(limit,int) or isinstance(limit,bool) or not 1<=limit<=64000:raise ValueError('Use a nonnegative character offset and page size 1–64000')
    def page(raw,missing=False):
        value,binary=text(raw)
        if missing:value=''
        total=len(value) if value is not None else 0;end=min(total,offset+limit)
        return {'text':value[offset:end] if value is not None else None,'available':value is not None,'binary':binary,'missing':missing,'bytes':len(raw) if raw is not None else 0,'totalCharacters':total,'offset':offset,'nextOffset':end,'done':offset+limit>=total}
    old=page(before);new=page(after,missing=after is None)
    return {**info,'before':old,'after':new,'offset':offset,'nextOffset':max(old['nextOffset'],new['nextOffset']),'done':old['done'] and new['done'],'patchAvailable':before is not None and not old['binary'] and not new['binary'] and (before!=after or kind_absent(info,after))}

def kind_absent(info,after):return info['baselineKind']=='absent' and after is not None

def quote_path(path):
    raw=path.encode('utf-8')
    if all(32<b<127 and b not in (34,92) for b in raw):return path
    return '"'+''.join(chr(b) if 32<b<127 and b not in (34,92) else '\\'+format(b,'03o') for b in raw)+'"'

def lines(value):
    parts=value.split('\n');return [v+'\n' for v in parts[:-1]]+([parts[-1]] if parts[-1] else [])

def patch(runtime,session,data,live=False):
    info,before,after=read(runtime,session,data,live=live);
    if live and any(raw is not None and len(raw)>2000000 for raw in (before,after)):raise ValueError('Patch is too large for live inspection. Browse paged content or download the result ZIP.')
    old,old_binary=text(before);new,new_binary=text(after)
    if before is None:raise ValueError('A patch requires a recovery copy or known initial absence. Use the result ZIP for current file bytes')
    if old_binary or new_binary:raise ValueError('Binary files do not have a text patch. Use the result ZIP for current changed bytes when available')
    new='' if after is None else new;diff=difflib.unified_diff(lines(old),lines(new),fromfile='/dev/null' if info['baselineKind']=='absent' else quote_path('a/'+info['path']),tofile='/dev/null' if after is None else quote_path('b/'+info['path']))
    result=[]
    if old==new=='' and (kind_absent(info,after) or after is None):result.append('diff --git '+quote_path('a/'+info['path'])+' '+quote_path('b/'+info['path'])+'\n'+('deleted file mode 100644' if after is None else 'new file mode 100644')+'\n')
    for line in diff:
        if line.endswith('\n'):result.append(line)
        else:result.extend([line+'\n','\\ No newline at end of file\n'])
    return {**info,'patch':''.join(result),'note':'Patch compares the stated recovery/absence baseline with current bytes. It is not necessarily a diff against the initial repository revision. No files were changed.'}
