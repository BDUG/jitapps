"""Session-scoped SQLite vector memory, using deterministic local text features."""
from array import array
from collections import Counter
from contextlib import closing
import hashlib
import heapq
import json
import math
from pathlib import Path
import re
import sqlite3
import time
import uuid

DIMENSIONS = 256
MODEL = 'local-hashed-words-bigrams-v1'

def vector(text):
    words=re.findall(r'\b[\w-]+\b',text.casefold())
    counts=Counter(words+[a+' '+b for a,b in zip(words,words[1:])])
    values=[0.0]*DIMENSIONS
    for token,count in counts.items():
        digest=hashlib.sha256(token.encode()).digest();slot=int.from_bytes(digest[:4],'little')%DIMENSIONS
        values[slot]+=(1 if digest[4]&1 else -1)*(1+math.log(count))
    norm=math.sqrt(sum(x*x for x in values))
    return [x/norm for x in values] if norm else values

def chunks(text,size=1400,overlap=160):
    return [text[i:i+size] for i in range(0,len(text),size-overlap)] or ['']

class Memory:
    def __init__(self,path,semantic=None):
        self.semantic=semantic
        self.path=Path(path)
        if self.path.is_symlink():raise ValueError('Memory database cannot be a symlink')
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with closing(self.connect()) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS chunks (session TEXT NOT NULL, document TEXT NOT NULL, part INTEGER NOT NULL, collection TEXT NOT NULL, source TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL, embedding BLOB NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(session,document,part))')
            db.execute('CREATE TABLE IF NOT EXISTS semantic_vectors (session TEXT NOT NULL, document TEXT NOT NULL, part INTEGER NOT NULL, model TEXT NOT NULL, embedding BLOB NOT NULL, PRIMARY KEY(session,document,part,model))')
            db.execute('CREATE INDEX IF NOT EXISTS session_collection ON chunks(session,collection)')
        self.path.chmod(0o600)
    def connect(self):
        db=sqlite3.connect(self.path,timeout=15);db.row_factory=sqlite3.Row;return db
    def store(self,session,text,source='',collection='notes',document=None,metadata=None):
        if not isinstance(text,str) or not text.strip():raise ValueError('Memory content must be nonempty text')
        document=document or uuid.uuid4().hex
        if not isinstance(document,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}',document):raise ValueError('Use a simple memory document ID')
        if not isinstance(collection,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}',collection):raise ValueError('Use a simple collection name')
        if not isinstance(source,str) or not isinstance(metadata or {},dict):raise ValueError('Memory source/metadata are invalid')
        encoded=json.dumps(metadata or {},ensure_ascii=False,allow_nan=False);parts=chunks(text);updated=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        rows=[(session,document,i,collection,source,content,encoded,array('f',vector(content)).tobytes(),updated) for i,content in enumerate(parts)]
        with closing(self.connect()) as db,db:
            db.execute('DELETE FROM semantic_vectors WHERE session=? AND document=?',(session,document))
            db.execute('DELETE FROM chunks WHERE session=? AND document=?',(session,document))
            db.executemany('INSERT INTO chunks VALUES (?,?,?,?,?,?,?,?,?)',rows)
        semantic_error=None
        if self.semantic:
            try:self.reindex(session,document=document,limit=len(parts))
            except Exception as e:semantic_error=type(e).__name__+': '+str(e)
        return {'id':document,'chunks':len(rows),'collection':collection,'source':source,'model':self.semantic.model if self.semantic and not semantic_error else MODEL,**({'semanticError':semantic_error} if semantic_error else {})}
    def search(self,session,query,limit=8,collection=None,cursor=0):
        if not isinstance(query,str) or not query.strip():raise ValueError('Provide a memory search query')
        limit=int(limit);cursor=int(cursor)
        if cursor<0 or not 1<=limit<=100:raise ValueError('Memory search limit must be 1–100')
        if self.semantic:
            try:return self.semantic_search(session,query,limit,collection,cursor)
            except Exception as error:
                fallback=self.lexical_search(session,query,limit,collection,cursor);fallback['semanticError']=type(error).__name__+': '+str(error);return fallback
        return self.lexical_search(session,query,limit,collection,cursor)
    def lexical_search(self,session,query,limit=8,collection=None,cursor=0):
        v=[(i,weight) for i,weight in enumerate(vector(query)) if weight];sql='SELECT document,part,embedding FROM chunks WHERE session=?';args=[session]
        if collection:sql+=' AND collection=?';args.append(collection)
        with closing(self.connect()) as db:
            db.execute('BEGIN')
            total=0
            def candidates():
                nonlocal total
                for row in db.execute(sql,args):
                    values=array('f');values.frombytes(row['embedding'])
                    score=sum(weight*values[i] for i,weight in v)
                    if score>0:
                        total+=1
                        yield (-score,row['document'],row['part'])
            ranked=heapq.nsmallest(cursor+limit,candidates()) if v else []
            results=[]
            for negative_score,document,part in ranked[cursor:cursor+limit]:
                score=-negative_score
                row=db.execute('SELECT * FROM chunks WHERE session=? AND document=? AND part=?',(session,document,part)).fetchone()
                results.append({'id':document,'part':part,'score':round(score,6),'collection':row['collection'],'source':row['source'],'text':row['content'],'metadata':json.loads(row['metadata']),'updatedAt':row['updated']})
        return {'model':MODEL,'dimensions':DIMENSIONS,'semantic':False,'matches':results,'matchedChunks':total,'nextCursor':cursor+len(results),'done':cursor+len(results)>=total,'note':'Local hashed lexical features with cosine similarity; not a cloud semantic embedding model.'}
    def health(self):
        return self.semantic.health() if self.semantic else {'enabled':False,'semantic':False,'backend':'lexical-hash','model':MODEL,'dimensions':DIMENSIONS,'note':'Configure --agent-embedding-dir for learned semantic retrieval.'}
    def reindex(self,session,document=None,limit=32):
        if not self.semantic:raise ValueError('Learned embeddings are not configured')
        if type(limit) is not int or not 1<=limit<=10000:raise ValueError('Embedding reindex limit must be 1–10000 chunks')
        sql='SELECT c.document,c.part,c.content FROM chunks c LEFT JOIN semantic_vectors s ON c.session=s.session AND c.document=s.document AND c.part=s.part AND s.model=? WHERE c.session=? AND s.model IS NULL';args=[self.semantic.model,session]
        if document:sql+=' AND c.document=?';args.append(document)
        with closing(self.connect()) as db:rows=db.execute(sql+' ORDER BY c.document,c.part LIMIT ?',args+[limit]).fetchall()
        vectors=self.semantic.embed_many([r['content'] for r in rows])
        with closing(self.connect()) as db,db:
            for row,value in zip(rows,vectors):
                current=db.execute('SELECT content FROM chunks WHERE session=? AND document=? AND part=?',(session,row['document'],row['part'])).fetchone()
                if current and current['content']==row['content']:db.execute('INSERT OR REPLACE INTO semantic_vectors VALUES (?,?,?,?,?)',(session,row['document'],row['part'],self.semantic.model,array('f',value).tobytes()))
            remaining=db.execute('SELECT COUNT(*) FROM chunks c LEFT JOIN semantic_vectors s ON c.session=s.session AND c.document=s.document AND c.part=s.part AND s.model=? WHERE c.session=? AND s.model IS NULL',(self.semantic.model,session)).fetchone()[0]
        return {'model':self.semantic.model,'processed':len(rows),'remaining':remaining,'done':remaining==0}
    def semantic_search(self,session,query,limit,collection,cursor):
        progress=self.reindex(session,limit=32);v=self.semantic.embed(query);sql='SELECT c.*,s.embedding AS learned_embedding FROM chunks c JOIN semantic_vectors s ON c.session=s.session AND c.document=s.document AND c.part=s.part WHERE c.session=? AND s.model=?';args=[session,self.semantic.model]
        if collection:sql+=' AND c.collection=?';args.append(collection)
        ranked=[]
        with closing(self.connect()) as db:
            for row in db.execute(sql,args):
                values=array('f');values.frombytes(row['learned_embedding'])
                if len(values)!=len(v):raise ValueError('Stored embedding dimensions do not match the configured model')
                score=sum(a*b for a,b in zip(v,values));ranked.append((score,dict(row)))
        ranked.sort(key=lambda r:(-r[0],r[1]['document'],r[1]['part']));results=[]
        for score,row in ranked[cursor:cursor+limit]:results.append({'id':row['document'],'part':row['part'],'score':round(score,6),'collection':row['collection'],'source':row['source'],'text':row['content'],'metadata':json.loads(row['metadata']),'updatedAt':row['updated']})
        return {'model':self.semantic.model,'dimensions':self.semantic.dimensions,'semantic':True,'matches':results,'matchedChunks':len(ranked),'nextCursor':cursor+len(results),'done':cursor+len(results)>=len(ranked),'indexing':progress,'note':'Learned local sentence embeddings; scores are cosine similarities, not confidence. Only vectors for this exact model are compared. Reindex remaining legacy chunks for full coverage.'}
    def list(self,session,cursor=0,limit=30):
        cursor=int(cursor);limit=int(limit)
        if cursor<0 or not 1<=limit<=100:raise ValueError('Invalid memory page')
        with closing(self.connect()) as db:
            total=db.execute('SELECT COUNT(DISTINCT document) FROM chunks WHERE session=?',(session,)).fetchone()[0]
            rows=db.execute('SELECT document,collection,source,updated,COUNT(*) AS parts FROM chunks WHERE session=? GROUP BY document ORDER BY updated DESC,document LIMIT ? OFFSET ?',(session,limit,cursor)).fetchall()
        return {'documents':[{'id':r['document'],'collection':r['collection'],'source':r['source'],'chunks':r['parts'],'updatedAt':r['updated']} for r in rows],'nextCursor':cursor+len(rows),'total':total,'done':cursor+len(rows)>=total}
    def read(self,session,document,cursor=0,limit=8):
        cursor=int(cursor);limit=int(limit)
        if cursor<0 or not 1<=limit<=100:raise ValueError('Invalid memory page')
        with closing(self.connect()) as db:
            total=db.execute('SELECT COUNT(*) FROM chunks WHERE session=? AND document=?',(session,document)).fetchone()[0]
            rows=db.execute('SELECT part,content FROM chunks WHERE session=? AND document=? ORDER BY part LIMIT ? OFFSET ?',(session,document,limit,cursor)).fetchall()
        return {'id':document,'chunks':[{'part':r['part'],'text':r['content']} for r in rows],'total':total,'nextCursor':cursor+len(rows),'done':cursor+len(rows)>=total}
    def delete(self,session,document):
        with closing(self.connect()) as db,db:
            db.execute('DELETE FROM semantic_vectors WHERE session=? AND document=?',(session,document))
            count=db.execute('DELETE FROM chunks WHERE session=? AND document=?',(session,document)).rowcount
        return {'id':document,'deletedChunks':count}
    def export(self,session):
        with closing(self.connect()) as db:
            rows=db.execute('SELECT document,part,collection,source,content,metadata,updated FROM chunks WHERE session=? ORDER BY document,part',(session,)).fetchall()
        return {'model':MODEL,'dimensions':DIMENSIONS,'retrieval':self.health(),'chunks':[{'id':r['document'],'part':r['part'],'collection':r['collection'],'source':r['source'],'text':r['content'],'metadata':json.loads(r['metadata']),'updatedAt':r['updated']} for r in rows],'rebuild':'Vectors can be recomputed from each chunk text with the recorded local feature model.'}
