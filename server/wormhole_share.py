"""Local-only durable inbox/outbox, with explicit code-based PC pairing."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import threading
import time
import uuid

MAX_FILE=8*1024*1024
MAX_QUEUED=64*1024*1024
ID=re.compile(r'^[a-f0-9]{32}$')

class Sharing:
    def __init__(self, directory, worker_python=None, relay=None, transit=None):
        if Path(directory).is_symlink():raise ValueError('Sharing storage cannot be a symlink')
        self.directory=Path(directory).resolve();self.directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.db=self.directory/'queues.sqlite3';self.python=worker_python or sys.executable
        self.relay=relay or os.environ.get('SUITE_WORMHOLE_RELAY_URL')
        self.transit=transit or os.environ.get('SUITE_WORMHOLE_TRANSIT_RELAY')
        self.lock=threading.RLock();self.live={};self.closed=False
        with self.connect() as db:
            db.executescript('CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,role TEXT,kind TEXT,created REAL);CREATE TABLE IF NOT EXISTS messages(id TEXT,session TEXT,direction TEXT,name TEXT,mime TEXT,digest TEXT,size INTEGER,data TEXT,status TEXT,created REAL,PRIMARY KEY(session,direction,id));')
    def connect(self):
        db=sqlite3.connect(self.db,timeout=15);db.row_factory=sqlite3.Row;return db
    def session(self, ident):
        if not isinstance(ident,str) or not ID.fullmatch(ident):raise ValueError('Invalid sharing session')
        with self.connect() as db:row=db.execute('SELECT * FROM sessions WHERE id=?',(ident,)).fetchone()
        if row is None:raise ValueError('Sharing session not found')
        return dict(row)
    def start(self, data):
        if self.closed:raise ValueError('Sharing service is stopped')
        role=data.get('role','master');kind=data.get('kind','files');code=data.get('code','')
        if role not in {'master','participant'} or kind not in {'files','colabrix'}:raise ValueError('Invalid sharing role or document kind')
        if not isinstance(code,str) or len(code)>200 or code and not re.fullmatch(r'[0-9]+(?:-[a-zA-Z0-9]+){2,8}',code):raise ValueError('Enter the complete magic-wormhole code')
        if bool(code)!=(role=='participant'):raise ValueError('The master creates a code; the participant enters it')
        if data.get('session'):
            session=self.session(data['session'])
            if session['role']!=role or session['kind']!=kind:raise ValueError('Resume with the original role and document kind')
            ident=session['id']
        else:
            ident=uuid.uuid4().hex
            with self.connect() as db:db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(ident,role,kind,time.time()))
        with self.lock:
            if ident in self.live and self.live[ident]['process'].poll() is None:raise ValueError('Close this pairing before reconnecting')
            if sum(s['process'].poll() is None for s in self.live.values())>=4:raise ValueError('At most four pairings can run at once')
            args=[self.python,'-u',str(Path(__file__).with_name('wormhole_worker.py')),'--role',role,'--kind',kind]
            if code:args+=['--code',code]
            if self.relay:args+=['--relay',self.relay]
            if self.transit:args+=['--transit',self.transit]
            process=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
            self.live[ident]={'process':process,'state':'pairing','code':'','error':'','inflight':None,'ready':False,'write':threading.Lock()}
            threading.Thread(target=self.read,args=(ident,process),daemon=True).start()
        return self.status(ident)
    def command(self, ident, value):
        live=self.live.get(ident)
        if not live or live['process'].poll() is not None:return
        with live['write']:
            try:live['process'].stdin.write(json.dumps(value,separators=(',',':'))+'\n');live['process'].stdin.flush()
            except (BrokenPipeError,OSError):live['state']='disconnected';live['ready']=False
    def read(self, ident, process):
        try:
            for line in process.stdout:
                value=json.loads(line)
                with self.lock:
                    live=self.live.get(ident)
                    if not live or live['process'] is not process:break
                    event=value.get('event')
                    if event=='code':live['code']=value['code']
                    elif event=='error':live.update(state='error',error=value['error'],ready=False)
                    elif event=='closed':live.update(state='disconnected' if not live['error'] else 'error',ready=False)
                    elif event=='message':self.receive(ident,value['message'])
        except (ValueError,OSError,RecursionError) as error:
            with self.lock:
                if self.live.get(ident,{}).get('process') is process:self.live[ident].update(state='error',error=str(error)[:400],ready=False)
            process.terminate()
        finally:
            with self.lock:
                if self.live.get(ident,{}).get('process') is process:
                    live=self.live[ident];live['ready']=False
                    if live['state'] not in {'error','disconnected'}:live.update(state='error',error='Transport exited. Install server/requirements-wormhole.txt in the server Python environment and check relay connectivity.')
    def receive(self, ident, message):
        session=self.session(ident);live=self.live[ident];kind=message.get('type')
        if kind=='hello':
            if message.get('protocol')!=1 or message.get('kind')!=session['kind'] or message.get('role')==session['role'] or message.get('role') not in {'master','participant'}:raise ValueError('Pair one master and one participant for the same sharing mode')
            live.update(state='connected',ready=True);self.pump(ident);return
        if not live['ready']:raise ValueError('Peer handshake required')
        if kind=='ack':
            with self.connect() as db:db.execute("UPDATE messages SET status='delivered',data=NULL WHERE session=? AND direction='out' AND id=?",(ident,message.get('id')))
            if message.get('id')==live['inflight']:live['inflight']=None
            self.pump(ident);return
        if kind!='item':raise ValueError('Unsupported peer message')
        item=self.validate(message)
        with self.connect() as db:
            exists=db.execute("SELECT digest FROM messages WHERE session=? AND direction='in' AND id=?",(ident,item['id'])).fetchone()
            if exists and exists['digest']!=item['digest']:raise ValueError('Peer reused a queue ID for different content')
            if not exists:
                self.capacity(db,ident,item['size'])
                db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?)',(item['id'],ident,'in',item['name'],item['mime'],item['digest'],item['size'],item['data'],'queued',time.time()))
        self.command(ident,{'op':'send','message':{'type':'ack','id':item['id']}})
    @staticmethod
    def validate(value):
        ident=value.get('id');name=value.get('name');mime=value.get('mime','application/octet-stream');encoded=value.get('data')
        if not isinstance(ident,str) or not ID.fullmatch(ident):raise ValueError('Invalid queue item ID')
        if not isinstance(name,str) or not 1<=len(name)<=180 or name in {'.','..'} or any(c in name for c in '/\\\x00') or any(ord(c)<32 for c in name):raise ValueError('Use a file name without directories or control characters')
        if not isinstance(mime,str) or len(mime)>160 or not isinstance(encoded,str) or len(encoded)>((MAX_FILE+2)//3)*4:raise ValueError('File exceeds 8 MiB')
        try:raw=base64.b64decode(encoded,validate=True)
        except (ValueError,TypeError):raise ValueError('Invalid file encoding') from None
        if len(raw)>MAX_FILE:raise ValueError('File exceeds 8 MiB')
        digest=hashlib.sha256(raw).hexdigest()
        if value.get('digest')!=digest:raise ValueError('File checksum mismatch')
        return dict(id=ident,name=name,mime=mime,data=encoded,size=len(raw),digest=digest)
    @staticmethod
    def capacity(db, ident, size):
        row=db.execute("SELECT COUNT(*),COALESCE(SUM(size),0) FROM messages WHERE session=? AND data IS NOT NULL",(ident,)).fetchone()
        if row[0]>=256 or row[1]+size>MAX_QUEUED:raise ValueError('Queue full (256 items or 64 MiB). Save/process incoming items before retrying.')
    def send(self, data):
        ident=data['session'];self.session(ident);item=self.validate(data)
        with self.lock,self.connect() as db:
            exists=db.execute("SELECT digest FROM messages WHERE session=? AND direction='out' AND id=?",(ident,item['id'])).fetchone()
            if exists and exists['digest']!=item['digest']:raise ValueError('Queue ID already used for another payload')
            if not exists:
                self.capacity(db,ident,item['size'])
                db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?)',(item['id'],ident,'out',item['name'],item['mime'],item['digest'],item['size'],item['data'],'queued',time.time()))
        self.pump(ident);return {'id':item['id'],'queued':True}
    def pump(self, ident):
        with self.lock:
            live=self.live.get(ident)
            if not live or not live['ready'] or live['inflight']:return
            with self.connect() as db:row=db.execute("SELECT * FROM messages WHERE session=? AND direction='out' AND status='queued' ORDER BY created,id LIMIT 1",(ident,)).fetchone()
            if row:
                live['inflight']=row['id'];self.command(ident,{'op':'send','message':{'type':'item',**{key:row[key] for key in ('id','name','mime','digest','data')}}})
    def status(self, ident):
        session=self.session(ident)
        with self.lock:
            live=self.live.get(ident,{});result={**session,**{k:live.get(k,default) for k,default in [('state','disconnected'),('code',''),('error','')]}}
        with self.connect() as db:
            result['queue']=[dict(r) for r in db.execute('SELECT id,direction,name,mime,size,status,created FROM messages WHERE session=? ORDER BY (data IS NULL),CASE WHEN data IS NOT NULL THEN created ELSE -created END,id LIMIT 1000',(ident,))]
        return result
    def dispatch(self, data):
        op=data.get('op')
        if op=='health':return {'available':importlib.util.find_spec('wormhole') is not None and importlib.util.find_spec('noise') is not None,'maxFileBytes':MAX_FILE,'maxQueuedBytes':MAX_QUEUED}
        if op=='start':return self.start(data)
        if op=='sessions':
            with self.connect() as db:return {'sessions':[dict(row) for row in db.execute('SELECT * FROM sessions ORDER BY created DESC LIMIT 100')]}
        ident=data.get('session');self.session(ident)
        if op=='status':return self.status(ident)
        if op=='send':return self.send(data)
        if op in {'read','done'}:
            with self.connect() as db:
                row=db.execute("SELECT * FROM messages WHERE session=? AND direction='in' AND id=?",(ident,data.get('id'))).fetchone()
                if row is None:raise ValueError('Incoming item not found')
                if op=='read':
                    if row['data'] is None:raise ValueError('Item was already processed')
                    return dict(row)
                db.execute("UPDATE messages SET data=NULL,status='processed' WHERE session=? AND direction='in' AND id=?",(ident,data.get('id')))
            return {'processed':True}
        if op=='stop':
            with self.lock:
                live=self.live.get(ident)
                if live:live.update(state='disconnected',ready=False)
            if live:self.terminate(live['process'])
            return self.status(ident)
        raise ValueError('Unknown sharing operation')
    @staticmethod
    def terminate(process):
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=2)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=2)
    def close(self):
        with self.lock:
            self.closed=True
            processes=[live['process'] for live in self.live.values()]
        for process in processes:self.terminate(process)
