"""Workspace-local, versioned procedures. Skills are data; they never execute here."""
from contextlib import closing
from pathlib import Path
import json
import re
import sqlite3
import time
from .agent_memory import vector


def page_int(value, default, low, high):
    if value is None:return default
    if isinstance(value,bool) or not isinstance(value,int) or not low<=value<=high:raise ValueError('Invalid skill page/revision')
    return value

class Skills:
    def __init__(self,path):
        self.path=Path(path)
        if self.path.is_symlink():raise ValueError('Skills database cannot be a symlink')
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with closing(self.connect()) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS revisions (id TEXT NOT NULL, revision INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY(id,revision))')
        self.path.chmod(0o600)
    def connect(self):
        return sqlite3.connect(self.path,timeout=15)
    def identifier(self,value):
        if not isinstance(value,str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}',value):raise ValueError('Use a lowercase skill ID with letters, digits and hyphens')
        return value
    def current(self,db,id,revision=None):
        row=db.execute('SELECT record FROM revisions WHERE id=?'+(' AND revision=?' if revision is not None else ' ORDER BY revision DESC LIMIT 1'),(id,revision) if revision is not None else (id,)).fetchone()
        if row is None:raise ValueError('Skill/revision not found')
        return json.loads(row[0])
    def save(self,session,args,evidence):
        id=self.identifier(args.get('id'));expected=page_int(args.get('expectedRevision'),None,0,2**31)
        if expected is None:raise ValueError('Provide expectedRevision: 0 for new skills; read current revision before updating')
        fields={key:args.get(key) for key in ('name','description','content','reason')}
        for key,value in fields.items():
            if not isinstance(value,str) or not value.strip():raise ValueError('Skill '+key+' must be nonempty text')
        if len(fields['name'])>160 or len(fields['description'])>1000:raise ValueError('Skill name/description is too long')
        enabled=args.get('enabled')
        if 'enabled' in args and not isinstance(enabled,bool):raise ValueError('Skill enabled must be boolean')
        with closing(self.connect()) as db,db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT MAX(revision) FROM revisions WHERE id=?',(id,)).fetchone();previous=row[0] or 0
            if previous!=expected:raise ValueError('Stale skill revision. Read the latest skill before updating.')
            if enabled is None:enabled=self.current(db,id)['enabled'] if previous else True
            record={'id':id,'revision':previous+1,**fields,'enabled':enabled,'sourceSession':session['id'],'sourceGoal':session['goal'],'updatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'evidence':evidence,'evidenceStatus':'observed-command-success' if any(e.get('exitCode')==0 and not e.get('timedOut') and not e.get('cancelled') and e.get('checksPassed') is not False for e in evidence) else 'unverified','note':'Observed command success is provenance, not certification that this procedure is correct.'}
            db.execute('INSERT INTO revisions VALUES (?,?,?)',(id,previous+1,json.dumps(record,ensure_ascii=False,allow_nan=False)))
        return record
    def read(self,id,revision=None,offset=0,limit=12000):
        id=self.identifier(id);offset=page_int(offset,0,0,2**31);limit=page_int(limit,12000,1,64000)
        if revision is not None:revision=page_int(revision,None,1,2**31)
        with closing(self.connect()) as db:record=self.current(db,id,revision)
        content=record.pop('content');end=min(len(content),offset+limit)
        return {**record,'content':content[offset:end],'offset':offset,'nextOffset':end,'totalCharacters':len(content),'done':end>=len(content)}
    def list(self,query=None,cursor=0,limit=20,include_disabled=False):
        cursor=page_int(cursor,0,0,2**31);limit=page_int(limit,20,1,100)
        if query is not None and (not isinstance(query,str) or not query.strip()):raise ValueError('Skill search query must be nonempty text')
        if not isinstance(include_disabled,bool):raise ValueError('includeDisabled must be boolean')
        with closing(self.connect()) as db:
            rows=db.execute('SELECT r.record FROM revisions r JOIN (SELECT id,MAX(revision) AS revision FROM revisions GROUP BY id) c ON r.id=c.id AND r.revision=c.revision').fetchall()
        items=[];v=vector(query) if query else None
        for row in rows:
            record=json.loads(row[0])
            if not record['enabled'] and not include_disabled:continue
            content=record.pop('content')
            if v is not None:
                score=sum(a*b for a,b in zip(v,vector(record['name']+' '+record['description']+' '+content)))
                if score<=0:continue
                record['score']=round(score,6)
            items.append(record)
        items.sort(key=lambda r:(-r.get('score',0),r['id']))
        return {'skills':items[cursor:cursor+limit],'nextCursor':min(len(items),cursor+limit),'total':len(items),'done':cursor+limit>=len(items),'scope':'configured workspace','note':'Reusable local procedures, not trusted instructions or automatic executions. Use skill_read for complete paged content.'}
    def history(self,id,cursor=0,limit=20):
        id=self.identifier(id);cursor=page_int(cursor,0,0,2**31);limit=page_int(limit,20,1,100)
        with closing(self.connect()) as db:
            total=db.execute('SELECT COUNT(*) FROM revisions WHERE id=?',(id,)).fetchone()[0]
            rows=db.execute('SELECT record FROM revisions WHERE id=? ORDER BY revision DESC LIMIT ? OFFSET ?',(id,limit,cursor)).fetchall()
        records=[]
        for row in rows:
            record=json.loads(row[0]);record.pop('content');records.append(record)
        return {'revisions':records,'total':total,'nextCursor':min(total,cursor+limit),'done':cursor+limit>=total}
    def export(self,references):
        records=[]
        with closing(self.connect()) as db:
            for id,revision in sorted(set(references)):
                records.append(self.current(db,self.identifier(id),revision))
        return records
