"""Local coding-agent workspace tools. File paths are bounded; commands are not an OS sandbox."""
from __future__ import annotations
import codecs
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid

SKIP = {'.git', '.suite-agent', 'node_modules', '__pycache__', '.venv', 'venv'}
TOOLS = [
 {'name':'list_files','description':'List workspace files recursively; cursor/limit provide pagination.','arguments':{'path':'relative directory, default .','cursor':'integer, default 0','limit':'1..500, default 100'}},
 {'name':'read_file','description':'Read a UTF-8 text page and its SHA-256. Use returned SHA on edits.','arguments':{'path':'relative file','offset':'character offset, default 0','limit':'1..64000, default 12000'}},
 {'name':'search','description':'Literal text search, excluding dependencies/private files; paginated matches.','arguments':{'query':'literal nonempty text','path':'relative directory, default .','cursor':'integer','limit':'1..200'}},
 {'name':'write_file','description':'Create/update text atomically. Existing files require expectedHash from read_file; new files require missing.','arguments':{'path':'relative file','content':'complete UTF-8 text','expectedHash':'SHA-256 or missing'}},
 {'name':'replace_text','description':'Exact source replacement guarded by SHA and expected occurrence count.','arguments':{'path':'relative file','find':'nonempty exact text','replacement':'text','expectedHash':'SHA-256','count':'expected occurrences, default 1'}},
 {'name':'delete_file','description':'Delete one file after reading it; creates a recovery copy. No directory deletion.','arguments':{'path':'relative file','expectedHash':'SHA-256'}},
 {'name':'list_scripts','description':'List this session’s managed working scripts.','arguments':{}},
 {'name':'write_script','description':'Create/update a managed working script, separate from project sources.','arguments':{'path':'relative script name','content':'complete script text'}},
 {'name':'read_script','description':'Read a page of a managed script.','arguments':{'path':'relative script name','offset':'character offset','limit':'1..64000'}},
 {'name':'delete_script','description':'Remove a managed script in this session.','arguments':{'path':'relative script name'}},
 {'name':'run_command','description':'Run an allowlisted executable with literal argv in a workspace subdirectory; returns real exit status and output log IDs.','arguments':{'command':'allowlisted name','args':'array of strings','cwd':'relative directory, default .','stdin':'optional text','timeout':'milliseconds, 100..600000'}},
 {'name':'run_script','description':'Execute a managed script using an allowlisted interpreter.','arguments':{'path':'managed script name','command':'allowlisted interpreter','args':'array','cwd':'relative directory','timeout':'milliseconds'}},
 {'name':'read_command_output','description':'Read full stdout/stderr logs in pages; previews are not complete logs.','arguments':{'jobId':'returned command job ID','stream':'stdout or stderr','offset':'character offset','limit':'1..64000'}},
 {'name':'changes','description':'Compare current project files with the initial manifest, including command-created changes.','arguments':{}},
 {'name':'restore_file','description':'Restore a file changed through file tools from its original session recovery copy; expectedHash guards the current content. Command-only edits have no automatic copy.','arguments':{'path':'relative file','expectedHash':'current SHA-256 or missing'}},
]

def digest(data): return hashlib.sha256(data).hexdigest()
def file_hash(path):
    value=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):value.update(chunk)
    return value.hexdigest()
def now(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
def integer(v, default, low, high):
    if v is None: return default
    if isinstance(v, bool) or not isinstance(v, int) or not low <= v <= high: raise ValueError('Integer is outside its supported range')
    return v

class Runtime:
    def __init__(self, workspace=None, commands=()):
        self.root = Path(workspace).expanduser().resolve() if workspace else None
        if self.root and not self.root.is_dir(): raise ValueError('Agent workspace must be an existing directory')
        self.allowed = {}
        for name in commands:
            executable = shutil.which(name)
            if not executable: raise ValueError('Agent executable not found: '+name)
            for alias in {name, Path(name).name, str(Path(executable).resolve())}: self.allowed[alias] = str(Path(executable).resolve())
        if self.allowed and not self.root: raise ValueError('--agent-workspace is required with --agent-allow-command')
        self.sessions = {}
        self.lock = threading.RLock()
        self.slots = threading.BoundedSemaphore(2)
        self.state = self.root/'.suite-agent' if self.root else None
        if self.state and self.state.is_symlink(): raise ValueError('Agent state directory cannot be a symlink')
    def health(self):
        return {'enabled':bool(self.root),'workspace':str(self.root) if self.root else None,'commands':sorted(set(self.allowed)), 'tools':TOOLS,'protocol':'suite-coding-agent/v1','commandIsolation':'OS permissions of the relay process; not sandboxed','fileRecovery':'File-tool edits only; command-side edits require your own backups/version control'}
    def enabled(self):
        if not self.root: raise PermissionError('Coding agent is disabled. Start the server with --agent-workspace /path/to/project')
    def path(self, value='.', directory=False, base=None, private=False):
        if not isinstance(value,str) or not value or len(value)>512 or '\\' in value or '\0' in value: raise ValueError('Use a relative workspace path')
        p=Path(value)
        if p.is_absolute() or '..' in p.parts: raise ValueError('Path must stay inside the configured workspace')
        if not private and any(part in {'.git','.suite-agent'} or part.startswith('.env') for part in p.parts): raise PermissionError('Private/state paths are excluded from file tools')
        base=(base or self.root).resolve()
        current=base
        for part in p.parts:
            current=current/part
            if current.is_symlink(): raise PermissionError('Symlinks are not supported by file tools')
        result=(base/p).resolve()
        if not result.is_relative_to(base): raise PermissionError('Path leaves the configured workspace')
        if directory and not result.is_dir(): raise ValueError('Directory does not exist')
        return result
    def files(self, directory=None):
        directory=directory or self.root
        result=[]
        for current, dirs, files in os.walk(directory, followlinks=False):
            dirs[:]=sorted(d for d in dirs if d not in SKIP and not d.startswith('.env') and not (Path(current)/d).is_symlink())
            for name in sorted(files):
                p=Path(current)/name
                if p.is_symlink() or name.startswith('.env'): continue
                result.append(p)
                if len(result)>20000: raise ValueError('Workspace scan exceeds 20,000 files; configure a smaller workspace')
        return result
    def manifest(self):
        return {str(p.relative_to(self.root)):{'hash':file_hash(p),'bytes':p.stat().st_size} for p in self.files()}
    def persist(self,s):
        with s['_lock']:
            s['updatedAt']=now()
            target=s['_dir']/'session.json'
            data={k:v for k,v in s.items() if not k.startswith('_')}
            temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(target)
    def get(self, ident):
        self.enabled()
        if not isinstance(ident,str) or not re.fullmatch(r'[a-f0-9]{32}',ident): raise ValueError('Invalid agent session ID')
        with self.lock:
            if ident not in self.sessions:
                directory=self.state/'sessions'/ident
                try: s=json.loads((directory/'session.json').read_text(encoding='utf-8'))
                except FileNotFoundError: raise ValueError('Agent session was not found')
                if s.get('workspace')!=str(self.root): raise ValueError('Session workspace does not match')
                s.update(_dir=directory,_cancel=threading.Event(),_lock=threading.RLock(),_active=None,_calls={e['value']['id'] for e in s['events'] if e.get('kind')=='action'},_running=False)
                if s['status']=='running': s['status']='paused'
                self.sessions[ident]=s
            return self.sessions[ident]
    def public(self,s): return {**{k:v for k,v in s.items() if not k.startswith('_') and k!='initial'},'toolRunning':s['_running']}
    def start(self,data):
        self.enabled()
        goal=data.get('goal');
        if not isinstance(goal,str) or not goal.strip() or len(goal)>100000: raise ValueError('Provide a goal under 100,000 characters')
        ident=uuid.uuid4().hex;directory=self.state/'sessions'/ident
        directory.mkdir(parents=True,mode=0o700);(directory/'scripts').mkdir();(directory/'logs').mkdir();(directory/'backups').mkdir()
        s={'id':ident,'workspace':str(self.root),'goal':goal,'tool':str(data.get('tool','codeiX'))[:100],'status':'running','allowEdits':data.get('allowEdits') is True,'allowCommands':data.get('allowCommands') is True,'createdAt':now(),'events':[],'jobs':{},'backups':{},'initial':self.manifest(),'_dir':directory,'_cancel':threading.Event(),'_lock':threading.RLock(),'_active':None,'_calls':set(),'_running':False}
        with self.lock: self.sessions[ident]=s
        self.persist(s);return self.public(s)
    def event(self,s,kind,value):
        with s['_lock']:
            record={'index':len(s['events']),'time':now(),'kind':kind,'value':value};s['events'].append(record);self.persist(s)
        return record
    def cancel(self,s):
        s['_cancel'].set()
        with s['_lock']:
            proc=s['_active']
            if proc: self.kill(proc)
            s['status']='paused';self.persist(s)
        return {'cancelRequested':True}
    @staticmethod
    def kill(proc):
        try:
            if os.name!='nt': os.killpg(proc.pid,signal.SIGKILL)
            else: proc.kill()
        except ProcessLookupError: pass
    def check(self,s):
        if s['_cancel'].is_set() or s['status']!='running': raise PermissionError('Agent session is paused or complete; resume it explicitly')
    def resume(self,s):
        with s['_lock']:
            if s['_running']: raise ValueError('Wait for the active tool to stop before resuming')
            s['_cancel'].clear();s['status']='running';self.persist(s)
        return self.public(s)
    def page(self,path,args):
        offset=integer(args.get('offset'),0,0,2**53-1);limit=integer(args.get('limit'),12000,1,64000);total=0;parts=[]
        try:
            with path.open('r',encoding='utf-8',newline='') as stream:
                while True:
                    chunk=stream.read(64000)
                    if not chunk:break
                    start=max(0,offset-total);end=min(len(chunk),offset+limit-total)
                    if end>start:parts.append(chunk[start:end])
                    total+=len(chunk)
        except UnicodeDecodeError:raise ValueError('This file is not UTF-8 text')
        return {'path':args.get('path'),'text':''.join(parts),'offset':offset,'nextOffset':min(total,offset+limit),'totalCharacters':total,'done':offset+limit>=total,'hash':file_hash(path),'bytes':path.stat().st_size}
    def guard(self,p,expected):
        actual=file_hash(p) if p.exists() else 'missing'
        if expected!=actual: raise ValueError('File changed or was not read first. Read it and supply its current expectedHash (or missing for a new file)')
    def backup(self,s,p):
        key=str(p.relative_to(self.root))
        if key not in s['backups']:
            ident=digest(key.encode());existed=p.exists()
            if existed: (s['_dir']/'backups'/ident).write_bytes(p.read_bytes())
            s['backups'][key]={'id':ident,'existed':existed};self.persist(s)
    def write(self,p,data):
        p.parent.mkdir(parents=True,exist_ok=True)
        temporary=p.with_name('.'+p.name+'.agent-'+uuid.uuid4().hex+'.tmp')
        try: temporary.write_bytes(data);temporary.replace(p)
        finally: temporary.unlink(missing_ok=True)
    def edits(self,s):
        if not s['allowEdits']: raise PermissionError('File editing was not enabled for this session')
    def changes(self,s):
        current=self.manifest();initial=s['initial'];result=[]
        for path in sorted(set(current)|set(initial)):
            if current.get(path)!=initial.get(path):result.append({'path':path,'status':'added' if path not in initial else 'deleted' if path not in current else 'modified','hash':current.get(path,{}).get('hash','missing'),'bytes':current.get(path,{}).get('bytes',0),'recoverable':path in s['backups']})
        return {'changes':result}
    def command(self,s,args,script=None):
        if not s['allowCommands']: raise PermissionError('Commands were not enabled for this session')
        executable=self.allowed.get(args.get('command'))
        if not executable: raise PermissionError('Executable is not on --agent-allow-command allowlist')
        argv=args.get('args',[]);stdin=args.get('stdin','')
        if not isinstance(argv,list) or len(argv)>200 or any(not isinstance(a,str) or '\0' in a for a in argv) or not isinstance(stdin,str): raise ValueError('Use literal text argv and stdin')
        timeout=integer(args.get('timeout'),30000,100,600000);cwd=self.path(args.get('cwd','.'),directory=True)
        if not self.slots.acquire(blocking=False): raise ValueError('Two commands are already running; retry later')
        job=uuid.uuid4().hex;paths={stream:s['_dir']/'logs'/(job+'.'+stream) for stream in ('stdout','stderr')};proc=None
        try:
            self.check(s)
            with paths['stdout'].open('wb') as out,paths['stderr'].open('wb') as err:
                proc=subprocess.Popen([executable,*([str(script)] if script else []),*argv],cwd=cwd,stdin=subprocess.PIPE,stdout=out,stderr=err,shell=False,start_new_session=os.name!='nt')
                with s['_lock']: s['_active']=proc
                def feed():
                    try:proc.stdin.write(stdin.encode('utf-8'));proc.stdin.flush()
                    except (BrokenPipeError,OSError):pass
                    finally:
                        try:proc.stdin.close()
                        except OSError:pass
                threading.Thread(target=feed,daemon=True).start();deadline=time.monotonic()+timeout/1000;timed_out=False
                while proc.poll() is None:
                    if s['_cancel'].is_set() or time.monotonic()>=deadline:
                        timed_out=not s['_cancel'].is_set();self.kill(proc);break
                    s['_cancel'].wait(.025)
                proc.wait(timeout=5)
                if os.name!='nt': self.kill(proc)
            result={'jobId':job,'command':args['command'],'args':([str(script)] if script else [])+argv,'cwd':str(cwd.relative_to(self.root)),'exitCode':proc.returncode,'cancelled':s['_cancel'].is_set(),'timedOut':timed_out,'finishedAt':now()}
            for stream,p in paths.items():
                with p.open('rb') as log:result[stream]=log.read(6000).decode('utf-8','replace')
                result[stream+'Bytes']=p.stat().st_size
            result['outputPaged']=any(result[stream+'Bytes']>6000 for stream in paths)
            with s['_lock']:s['jobs'][job]=result;self.persist(s)
            return result
        finally:
            if proc and proc.poll() is None:self.kill(proc)
            with s['_lock']:s['_active']=None
            self.slots.release()
    def tool(self,s,name,args,call_id):
        self.check(s)
        if name not in {t['name'] for t in TOOLS} or not isinstance(args,dict): raise ValueError('Unknown tool or invalid arguments')
        if not isinstance(call_id,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',call_id):raise ValueError('Provide a unique tool call ID')
        with s['_lock']:
            if s['_running']:raise ValueError('A tool is already running in this session')
            if call_id in s['_calls']:raise ValueError('Tool call ID was already used; inspect observations before repeating an action')
            s['_calls'].add(call_id);s['_running']=True
        self.event(s,'action',{'id':call_id,'tool':name,'args':args})
        try:
            result=self.execute(s,name,args);self.event(s,'observation',{'id':call_id,'tool':name,'ok':True,'result':result});return {'ok':True,'result':result}
        except (ValueError,PermissionError,OSError,UnicodeError,KeyError,TypeError) as error:
            result={'ok':False,'error':str(error)};self.event(s,'observation',{'id':call_id,'tool':name,**result});return result
        finally:
            with s['_lock']:s['_running']=False
    def execute(self,s,name,a):
        if name=='list_files':
            directory=self.path(a.get('path','.'),directory=True);files=self.files(directory);cursor=integer(a.get('cursor'),0,0,2**31);limit=integer(a.get('limit'),100,1,500)
            return {'files':[{'path':str(p.relative_to(self.root)),'bytes':p.stat().st_size} for p in files[cursor:cursor+limit]],'nextCursor':min(len(files),cursor+limit),'total':len(files),'done':cursor+limit>=len(files)}
        if name=='read_file':return self.page(self.path(a['path']),a)
        if name=='search':
            query=a.get('query');
            if not isinstance(query,str) or not query or len(query)>1000:raise ValueError('Provide a literal query under 1000 characters')
            cursor=integer(a.get('cursor'),0,0,2**31);limit=integer(a.get('limit'),50,1,200);matches=[]
            for p in self.files(self.path(a.get('path','.'),directory=True)):
                try:text=p.read_text(encoding='utf-8')
                except (UnicodeError,OSError):continue
                for i,line in enumerate(text.splitlines()):
                    if query in line:matches.append({'path':str(p.relative_to(self.root)),'line':i+1,'excerpt':line[:500]})
            return {'matches':matches[cursor:cursor+limit],'nextCursor':min(len(matches),cursor+limit),'total':len(matches),'done':cursor+limit>=len(matches)}
        if name in {'write_file','replace_text','delete_file','restore_file'}:
            self.edits(s);p=self.path(a['path']);self.guard(p,a.get('expectedHash'))
            if p.is_dir():raise ValueError('File tools do not replace or delete directories')
            if name=='restore_file':
                entry=s['backups'].get(str(p.relative_to(self.root)))
                if not entry:raise ValueError('No file-tool recovery copy exists for this path')
                if entry['existed']:self.write(p,(s['_dir']/'backups'/entry['id']).read_bytes())
                else:p.unlink(missing_ok=True)
            else:
                content=a.get('content')
                if name=='replace_text':
                    find=a.get('find');replacement=a.get('replacement');count=integer(a.get('count'),1,1,100000)
                    if not isinstance(find,str) or not find or not isinstance(replacement,str):raise ValueError('Provide literal find and replacement strings')
                    content=p.read_text(encoding='utf-8')
                    if content.count(find)!=count:raise ValueError('Exact match occurrence count differs; read the file again')
                    content=content.replace(find,replacement)
                if name!='delete_file' and (not isinstance(content,str) or '\0' in content or len(content.encode('utf-8'))>2000000):raise ValueError('File-tool writes must be UTF-8 text under 2 MB')
                self.backup(s,p)
                if name=='delete_file':p.unlink()
                else:self.write(p,content.encode('utf-8'))
            return {'path':a['path'],'hash':file_hash(p) if p.exists() else 'missing','bytes':p.stat().st_size if p.exists() else 0,'recoverable':True}
        if name=='list_scripts':return {'scripts':[str(p.relative_to(s['_dir']/'scripts')) for p in (s['_dir']/'scripts').rglob('*') if p.is_file() and not p.is_symlink()]}
        if name in {'write_script','read_script','delete_script','run_script'}:
            p=self.path(a['path'],base=s['_dir']/'scripts',private=True)
            if name=='write_script':
                self.edits(s);content=a.get('content')
                if not isinstance(content,str) or '\0' in content or len(content.encode())>2000000:raise ValueError('Script must be UTF-8 text under 2 MB')
                self.write(p,content.encode());return {'path':a['path'],'hash':file_hash(p),'bytes':p.stat().st_size}
            if name=='read_script':return self.page(p,a)
            if name=='delete_script':self.edits(s);p.unlink();return {'deleted':a['path']}
            return self.command(s,a,script=p)
        if name=='run_command':return self.command(s,a)
        if name=='read_command_output':
            job=a.get('jobId');stream=a.get('stream','stdout')
            if job not in s['jobs'] or stream not in {'stdout','stderr'}:raise ValueError('Unknown command output')
            p=s['_dir']/'logs'/(job+'.'+stream)
            # Logs can contain non-UTF-8 bytes; replace invalid bytes rather than losing the complete stream.
            offset=integer(a.get('offset'),0,0,2**53-1);limit=integer(a.get('limit'),12000,4,64000);size=p.stat().st_size
            with p.open('rb') as stream:stream.seek(offset);data=stream.read(limit)
            decoder=codecs.getincrementaldecoder('utf-8')('replace');text=decoder.decode(data,final=offset+len(data)>=size);buffered=len(decoder.getstate()[0]);end=min(size,offset+len(data)-buffered)
            return {'text':text,'nextOffset':end,'offset':offset,'totalBytes':size,'done':end>=size}
        if name=='changes':return self.changes(s)
        raise ValueError('Unknown tool')
    def dispatch(self,data):
        operation=data.get('op')
        if operation=='health':return self.health()
        if operation=='start':return self.start(data)
        if operation=='list':
            self.enabled();folder=self.state/'sessions';values=[]
            if folder.exists():
                for p in folder.glob('*/session.json'):
                    try:s=self.get(p.parent.name);values.append({k:s[k] for k in ('id','goal','status','createdAt','updatedAt','tool')})
                    except (ValueError,OSError):continue
            return {'sessions':sorted(values,key=lambda v:v['createdAt'],reverse=True)}
        s=self.get(data.get('session'))
        if operation=='session':return self.public(s)
        if operation=='cancel':return self.cancel(s)
        if operation=='resume':return self.resume(s)
        if operation=='event':return self.event(s,'user' if isinstance(data.get('value'),dict) and data['value'].get('status')=='follow_up' else 'assistant',data.get('value'))
        if operation=='manual_command':
            self.resume(s)
            try:return self.tool(s,'run_command',data.get('args',{}),data.get('callId',uuid.uuid4().hex))
            finally:self.cancel(s)
        if operation in {'file','artifacts','script_read','script_write','script_delete','output','restore_file'}:
            if operation in {'script_write','script_delete','restore_file'} and s['_running']:raise ValueError('Wait for the active tool before editing artifacts')
            names={'file':'read_file','artifacts':'list_scripts','script_read':'read_script','script_write':'write_script','script_delete':'delete_script','output':'read_command_output','restore_file':'restore_file'}
            args={k:v for k,v in data.items() if k not in {'op','session'}}
            value=self.execute(s,names[operation],args)
            if operation in {'script_write','script_delete','restore_file'}:self.event(s,'user_action',{'operation':operation,'path':data.get('path')})
            return value
        if operation=='finish':
            self.check(s)
            if s['_running']:raise ValueError('A tool is still running')
            s['status']='complete';self.event(s,'completion',{'summary':str(data.get('summary','')),'verification':data.get('verification',[])});return self.public(s)
        if operation=='tool':return self.tool(s,data.get('tool'),data.get('args',{}),data.get('callId'))
        if operation=='changes':return self.changes(s)
        raise ValueError('Unknown agent operation')

    def close(self):
        for session in list(self.sessions.values()):
            if session['status']=='running':self.cancel(session)
