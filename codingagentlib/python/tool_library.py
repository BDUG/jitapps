"""Versioned, project-independent Python recipes, skills and named targets."""
import ast
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time
from .contracts import check_schema, validate


class ToolLibrary:
    def __init__(self,path):
        self.path=Path(path)
        if self.path.is_symlink():raise ValueError('Tool library cannot be a symlink')
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with closing(self.connect()) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS tools(id TEXT PRIMARY KEY,record TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS targets(id TEXT PRIMARY KEY,record TEXT NOT NULL)')
        self.path.chmod(0o600)

    def connect(self):return sqlite3.connect(self.path,timeout=15)

    def identifier(self,value):
        if not isinstance(value,str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,79}',value):raise ValueError('Use a stable lowercase tool/target ID')
        return value

    def read(self,identity,table='tools'):
        self.identifier(identity)
        with closing(self.connect()) as db:
            row=db.execute('SELECT record FROM '+table+' WHERE id=?',(identity,)).fetchone()
        if not row:raise ValueError('Tool/target not found')
        return json.loads(row[0])

    def save(self,data):
        identity=self.identifier(data.get('id'));source=data.get('source');schema=data.get('parameters',dict(type='object'))
        if not isinstance(source,str) or len(source.encode())>100000:raise ValueError('Python tool source is limited to 100 KB')
        ast.parse(source)
        check_schema(schema)
        if schema.get('type')!='object':raise ValueError('Tool parameters must be an object schema')
        name=data.get('name',identity)
        if not isinstance(name,str) or not name.strip() or len(name)>200:raise ValueError('Invalid tool name')
        # Metadata has no workspace binding; callers supply paths through input JSON.
        skills=data.get('skills',[])
        if not isinstance(skills,list) or any(not isinstance(s,str) or len(s)>80 for s in skills):raise ValueError('Invalid tool skills')
        record=dict(id=identity,name=name,source=source,sha256=hashlib.sha256(source.encode()).hexdigest(),parameters=schema,skills=data.get('skills',[]),language='python',projectAgnostic=True,updated=time.time(),evidence=data.get('evidence',[]))
        self._save('tools',record,data.get('expectedRevision'))
        return record

    def _save(self,table,record,expected):
        if type(expected) is not int or expected<0:raise ValueError('Read current revision; use expectedRevision=0 for a new item')
        with closing(self.connect()) as db,db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT record FROM '+table+' WHERE id=?',(record['id'],)).fetchone();revision=json.loads(row[0])['revision'] if row else 0
            if revision!=expected:raise ValueError('Stale tool/target revision')
            record['revision']=revision+1
            db.execute('INSERT OR REPLACE INTO '+table+' VALUES(?,?)',(record['id'],json.dumps(record,allow_nan=False)))

    def target(self,data):
        identity=self.identifier(data.get('id'));tool=self.read(data.get('tool'));arguments=data.get('arguments',{})
        validate(tool['parameters'],arguments)
        skills=data.get('skills',[])
        if not isinstance(skills,list) or any(not isinstance(s,str) or len(s)>80 for s in skills):raise ValueError('Invalid target skills')
        record=dict(id=identity,name=str(data.get('name',identity))[:200],tool=tool['id'],toolRevision=tool['revision'],toolHash=tool['sha256'],arguments=arguments,skills=skills)
        self._save('targets',record,data.get('expectedRevision'));return record

    def list(self,table='tools'):
        with closing(self.connect()) as db:
            rows=db.execute('SELECT record FROM '+table+' ORDER BY id LIMIT 501').fetchall()
        return dict(items=[{k:v for k,v in json.loads(row[0]).items() if k!='source'} for row in rows[:500]],complete=len(rows)<=500)

    def harvest(self,path,result,expected_hash=None):
        """Implicitly capture only explicitly parameterized, successfully run recipes."""
        if result.get('exitCode')!=0 or result.get('timedOut') or result.get('cancelled') or path.suffix!='.py':return None
        with path.open('rb') as stream:raw=stream.read(100001)
        if len(raw)>100000 or expected_hash is not None and hashlib.sha256(raw).hexdigest()!=expected_hash:return None
        source=raw.decode('utf-8')
        marker=re.search(r'^# codingagent-tool: (\{[^\n]+\})$',source,re.M)
        if not marker:return None
        metadata=json.loads(marker[1]);identity=self.identifier(metadata.get('id'))
        # Never promote a project-specific absolute path or likely embedded credential.
        tree=ast.parse(source)
        for item in ast.walk(tree):
            if isinstance(item,ast.Constant) and isinstance(item.value,str):
                text=item.value
                if Path(text).is_absolute() or re.search(r'(?:sk-[A-Za-z0-9]{12,}|-----BEGIN .*PRIVATE KEY|Bearer\s+\S+)',text):return None
        try:previous=self.read(identity)
        except ValueError:previous=None
        if previous and previous['sha256']==hashlib.sha256(source.encode()).hexdigest():return previous
        # Implicit capture may create a recipe, never overwrite an existing revision.
        if previous:return None
        return self.save({**metadata,'source':source,'expectedRevision':0,'evidence':[dict(jobId=result['jobId'],exitCode=0,stdoutSha256=result.get('stdoutSha256'))]})

    def dispatch(self,data):
        action=data.get('action','list')
        if action=='list':return self.list('targets' if data.get('kind')=='target' else 'tools')
        if action=='read':return self.read(data.get('id'),'targets' if data.get('kind')=='target' else 'tools')
        if action=='save':return self.save(data)
        if action=='target_save':return self.target(data)
        if action=='export':
            listing=self.list();targets=self.list('targets')
            ids=data.get('ids',[item['id'] for item in listing['items']])
            if not isinstance(ids,list) or len(ids)>100 or len(set(ids))!=len(ids):raise ValueError('Export at most 100 unique tool IDs per bundle')
            if 'ids' not in data and not listing['complete']:raise ValueError('Select tool IDs for a bounded export')
            tools=[self.read(identity) for identity in ids]
            selected_targets=[t for t in targets['items'] if t['tool'] in ids]
            if len(selected_targets)>100 or not targets['complete']:raise ValueError('Target export is incomplete; split the library')
            bundle=dict(format='codingagentlib/python-tools-v1',version=1,tools=tools,targets=selected_targets)
            if len(json.dumps(bundle).encode())>2000000:raise ValueError('Export bundle exceeds 2 MB; select fewer tool IDs')
            return bundle
        if action=='import':
            payload=data.get('payload')
            if not isinstance(payload,dict) or payload.get('format')!='codingagentlib/python-tools-v1' or (type(payload.get('version')) is not int or payload.get('version')!=1) or len(json.dumps(payload).encode())>2000000:raise ValueError('Invalid tool bundle')
            if not isinstance(payload.get('tools'),list) or len(payload['tools'])>100 or not isinstance(payload.get('targets',[]),list) or len(payload.get('targets',[]))>100:raise ValueError('Tool bundle bounds')
            # Validate all records before one transaction; imported source remains unexecuted.
            tools=[];ids=set()
            for item in payload['tools']:
                identity=self.identifier(item.get('id'))
                if identity in ids:raise ValueError('Duplicate imported tool')
                ids.add(identity);source=item.get('source')
                if not isinstance(source,str) or len(source.encode())>100000:raise ValueError('Invalid tool source')
                ast.parse(source);check_schema(item['parameters'])
                name=item.get('name',identity);skills=item.get('skills',[])
                if not isinstance(name,str) or not name.strip() or len(name)>200 or item['parameters'].get('type')!='object' or not isinstance(skills,list) or len(skills)>200 or any(not isinstance(s,str) or len(s)>80 for s in skills):raise ValueError('Invalid imported tool metadata')
                tools.append(dict(id=identity,name=name,source=source,revision=1,sha256=hashlib.sha256(source.encode()).hexdigest(),parameters=item['parameters'],skills=skills,evidence=[],imported=True,language='python',projectAgnostic=True))
            targets=[];toolmap={t['id']:t for t in tools};target_ids=set()
            for item in payload.get('targets',[]):
                identity=self.identifier(item.get('id'));tool=toolmap.get(item.get('tool'))
                if identity in target_ids or not tool:raise ValueError('Invalid imported target')
                if not isinstance(item.get('name',identity),str) or len(item.get('name',identity))>200 or not isinstance(item.get('skills',[]),list) or any(not isinstance(s,str) or len(s)>80 for s in item.get('skills',[])):raise ValueError('Invalid imported target metadata')
                target_ids.add(identity);validate(tool['parameters'],item.get('arguments',{}));targets.append({**item,'id':identity,'revision':1,'toolRevision':1,'toolHash':tool['sha256']})
            with closing(self.connect()) as db,db:
                db.execute('BEGIN IMMEDIATE')
                for table,records in [('tools',tools),('targets',targets)]:
                    for record in records:
                        if db.execute('SELECT 1 FROM '+table+' WHERE id=?',(record['id'],)).fetchone():raise ValueError('Import conflicts with existing library; use a new ID')
                        db.execute('INSERT INTO '+table+' VALUES(?,?)',(record['id'],json.dumps(record,allow_nan=False)))
            return dict(imported=len(tools),targets=len(targets),executed=False)
        raise ValueError('Unsupported tool-library action')
