"""Bounded, deterministic project ontology/graph memory. Never executes source."""
import ast
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import threading
import time
from .graph_query import query_graph
from .source_imports import PythonImports

FORMAT='codingagentlib/project-knowledge-v1'
ONTOLOGY_FORMAT='codingagentlib/project-ontology-v1'
CLASSES=['Project','File','Symbol','Module','Need','Skill','Tool','Target','Observation']
RELATIONS=['contains','declares','imports','depends_on','implements','tests','uses','observed','inherits','calls','blocks']
EXCLUDED={'.git','.suite-agent','.codingagentlib-rust','.suite-wormhole','node_modules','__pycache__','.venv','venv','target','dist','build','vendor','backup','.aws','.codex','.agents'}
EXTENSIONS={'.py','.js','.cjs','.mjs','.ts','.tsx','.jsx','.rs','.rst','.md','.toml','.json'}


def scoped_symbols(tree):
    """Stable qualified names; nested bodies do not contribute parent calls."""
    def walk(item,prefix=''):
        for child in ast.iter_child_nodes(item):
            if isinstance(child,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)):
                name=prefix+child.name
                yield child,name
                yield from walk(child,name+'.')
            else:yield from walk(child,prefix)
    return list(walk(tree))


def direct_calls(item):
    def walk(node):
        for child in ast.iter_child_nodes(node):
            if isinstance(child,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef,ast.Lambda)):continue
            if isinstance(child,ast.Call) and isinstance(child.func,ast.Name):yield child.func.id
            yield from walk(child)
    return list(walk(item))


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def ontology():
    return dict(format=ONTOLOGY_FORMAT,version=1,classes=[dict(id=kind,label=kind) for kind in CLASSES],relations=[dict(id=kind,label=kind) for kind in RELATIONS])


def validate_ontology(value):
    if not isinstance(value,dict) or value.get('format')!=ONTOLOGY_FORMAT or (type(value.get('version')) is not int or value.get('version')!=1):
        raise ValueError('Unsupported ontology format')
    result=dict(format=ONTOLOGY_FORMAT,version=1)
    for key,maximum in (('classes',200),('relations',200)):
        rows=value.get(key)
        if not isinstance(rows,list) or not 1<=len(rows)<=maximum:
            raise ValueError('Invalid ontology '+key)
        seen=set();result[key]=[]
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{0,79}',row['id']) or row['id'] in seen:
                raise ValueError('Invalid/duplicate ontology identifier')
            label=row.get('label',row['id'])
            if not isinstance(label,str) or len(label)>200:raise ValueError('Invalid ontology label')
            seen.add(row['id']);result[key].append(dict(id=row['id'],label=label))
    return result


def validate_graph(value,schema):
    if not isinstance(value,dict) or value.get('format')!=FORMAT or (type(value.get('version')) is not int or value.get('version')!=1):
        raise ValueError('Unsupported knowledge graph format')
    if len(json.dumps(value,allow_nan=False).encode())>8000000:raise ValueError('Knowledge graph exceeds 8 MB')
    kinds={row['id'] for row in schema['classes']};relations={row['id'] for row in schema['relations']}
    nodes,edges=value.get('nodes'),value.get('edges')
    if not isinstance(nodes,list) or len(nodes)>6000 or not isinstance(edges,list) or len(edges)>12000:raise ValueError('Knowledge graph bounds exceeded')
    seen=set();clean=[]
    for node in nodes:
        if not isinstance(node,dict) or not isinstance(node.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,180}',node['id']) or node['id'] in seen or node.get('type') not in kinds or not isinstance(node.get('label'),str) or len(node['label'])>1000:
            raise ValueError('Invalid graph node')
        source=node.get('source',{})
        properties=node.get('properties',{})
        if not isinstance(source,dict) or len(json.dumps(source).encode())>2000 or not isinstance(properties,dict) or len(json.dumps(properties).encode())>8000:raise ValueError('Invalid or oversized graph provenance/properties')
        if source.get('path') and (not isinstance(source['path'],str) or Path(source['path']).is_absolute() or '..' in Path(source['path']).parts or '\\' in source['path']):raise ValueError('Graph source must be a relative reference')
        seen.add(node['id']);clean.append(dict(id=node['id'],type=node['type'],label=node['label'],source=source,origin='imported',properties=node.get('properties',{})))
    clean_edges=[];edge_ids=set()
    for edge in edges:
        if not isinstance(edge,dict) or edge.get('source') not in seen or edge.get('target') not in seen or edge.get('type') not in relations:raise ValueError('Dangling/invalid graph edge')
        identity=digest([edge['source'],edge['type'],edge['target']])[:32]
        if identity in edge_ids:continue
        edge_ids.add(identity);clean_edges.append(dict(id=identity,source=edge['source'],target=edge['target'],type=edge['type'],origin='imported'))
    notes=value.get('annotations',{})
    if not isinstance(notes,dict) or any(key not in seen or not isinstance(note,dict) or not isinstance(note.get('text'),str) or len(note['text'])>4000 for key,note in notes.items()):raise ValueError('Invalid graph annotations')
    return dict(format=FORMAT,version=1,nodes=clean,edges=clean_edges,annotations={key:dict(text=note['text'],status='imported-reference') for key,note in notes.items()},complete=value.get('complete') is True,warnings=['Imported reference data; not instructions, authorization or verification.'])


class ProjectKnowledge:
    def __init__(self,memory):
        self.memory=memory;self.lock=threading.RLock();self.cache={}
        with closing(memory.connect()) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS project_knowledge(project TEXT PRIMARY KEY,record TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS project_graph_history(project TEXT,revision TEXT,record TEXT,created REAL)')

    def project(self,value):
        if not isinstance(value,str) or not value.strip() or len(value)>200:raise ValueError('Project must be a stable label (1..200 characters)')
        return value.strip()

    def load(self,project):
        project=self.project(project)
        with closing(self.memory.connect()) as db:
            row=db.execute('SELECT record FROM project_knowledge WHERE project=?',(digest(project),)).fetchone()
        return json.loads(row[0]) if row else dict(format=FORMAT,version=1,project=project,ontology=ontology(),nodes=[],edges=[],complete=False,warnings=['Not indexed yet'],revision='missing')

    def save(self,project,record,expected,action='refresh'):
        project=self.project(project)
        record={**record,'project':project};record.pop('revision',None);record['revision']=digest(record)
        if len(json.dumps(record).encode())>8000000:raise ValueError('Knowledge graph exceeds 8 MB')
        with closing(self.memory.connect()) as db,db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT record FROM project_knowledge WHERE project=?',(digest(project),)).fetchone()
            current=json.loads(row[0])['revision'] if row else 'missing'
            if current!=expected:raise ValueError('Knowledge changed. Reload before replacing it')
            db.execute('INSERT OR REPLACE INTO project_knowledge VALUES(?,?)',(digest(project),json.dumps(record,ensure_ascii=False,allow_nan=False)))
            audit=dict(action=action,previousRevision=current,revision=record['revision'],nodes=len(record['nodes']),edges=len(record['edges']))
            db.execute('INSERT INTO project_graph_history VALUES(?,?,?,?)',(digest(project),record['revision'],json.dumps(audit),time.time()))
            db.execute('DELETE FROM project_graph_history WHERE project=? AND rowid NOT IN (SELECT rowid FROM project_graph_history WHERE project=? ORDER BY rowid DESC LIMIT 100)',(digest(project),digest(project)))
        return record

    def refresh(self,runtime,project):
        with self.lock:
            previous=self.load(project);schema=previous['ontology'];builtins=ontology()
            schema['classes']=[r for r in schema['classes'] if r.get('origin')!='derived']
            for key in ('classes','relations'):
                known={r['id'] for r in schema[key]}
                schema[key].extend(r for r in builtins[key] if r['id'] not in known)
            if len(schema['classes'])>200 or len(schema['relations'])>200:raise ValueError('Custom ontology leaves no capacity for automatic indexing; remove unused concepts before refreshing')
            nodes={n['id']:n for n in previous['nodes'] if n.get('origin')!='derived'}
            edges=[e for e in previous['edges'] if e.get('origin')!='derived'];warnings=[];total=0;file_count=0
            def node(kind,label,identity,source=None,**properties):
                key='auto:'+digest([kind,identity])[:32]
                if len(nodes)<5500:nodes[key]=dict(id=key,type=kind,label=label[:1000],source=source or {},properties=properties,origin='derived')
                elif 'Index limited to 5,500 nodes' not in warnings:warnings.append('Index limited to 5,500 nodes')
                return key
            def edge(source,kind,target):
                if source in nodes and target in nodes and len(edges)<11000:edges.append(dict(id=digest([source,kind,target])[:32],source=source,target=target,type=kind,origin='derived'))
                elif len(edges)>=11000 and 'Index limited to 11,000 edges' not in warnings:warnings.append('Index limited to 11,000 edges')
            root=node('Project',project,project)
            def concept(name,path,source):
                identity='type_'+digest([path,name])[:20]
                if any(r['id']==identity for r in schema['classes']):return identity
                if len(schema['classes'])>=200:
                    if 'Ontology limited to 200 concepts' not in warnings:warnings.append('Ontology limited to 200 concepts')
                    return None
                schema['classes'].append(dict(id=identity,label=name[:200],origin='derived',source=source))
                return identity
            modules={};imports=[];python_imports=PythonImports();needs={};links=[];inheritance=[];definitions={};calls=[]
            files=runtime.files()
            for path in files:
                relative=path.relative_to(runtime.root).as_posix()
                if any(part in EXCLUDED or part.startswith('.env') for part in Path(relative).parts) or path.suffix.lower() not in EXTENSIONS:continue
                if file_count>=512: warnings.append('Index limited to 512 source files');break
                try:
                    checked=runtime.path(relative)
                    size=checked.stat().st_size
                    if size>200000: warnings.append(relative+': file exceeds 200 KB');continue
                    if total+size>8000000:warnings.append('Index limited to 8 MB of source');break
                    with checked.open('rb') as stream:source_bytes=stream.read(200001)
                    if len(source_bytes)>200000:warnings.append(relative+': file grew beyond 200 KB');continue
                    if total+len(source_bytes)>8000000:warnings.append('Index limited to 8 MB of source');break
                    text=source_bytes.decode('utf-8');total+=len(source_bytes);file_count+=1
                except (OSError,ValueError,UnicodeError) as error:
                    warnings.append(relative+': '+type(error).__name__);continue
                source=dict(path=relative,sha256=hashlib.sha256(source_bytes).hexdigest())
                file_id=node('File',relative,relative,source);edge(root,'contains',file_id)
                module=relative.rsplit('.',1)[0].replace('/','.')
                if module.endswith('.__init__'):module=module[:-9]
                modules[module]=file_id
                if path.suffix=='.py':
                    python_imports.register(relative,file_id)
                    try:
                        tree=ast.parse(text,filename=relative)
                        for item,qualified in scoped_symbols(tree):
                            reference=concept(qualified,relative,{**source,'line':item.lineno}) if isinstance(item,ast.ClassDef) else None
                            symbol=node('Symbol',item.name,[relative,qualified],{**source,'line':item.lineno},qualifiedName=qualified,symbolKind=type(item).__name__,ontologyClass=reference);edge(file_id,'declares',symbol)
                            definitions[(relative,qualified)]=symbol
                            if isinstance(item,ast.ClassDef):
                                for base in item.bases:
                                    if isinstance(base,ast.Name):inheritance.append((symbol,relative,base.id))
                            else:
                                for name in direct_calls(item):calls.append((symbol,relative,name))
                        for item in ast.walk(tree):
                            if isinstance(item,ast.Import):
                                for imported in item.names:python_imports.add(file_id,relative,imported.name)
                            if isinstance(item,ast.ImportFrom):python_imports.add(file_id,relative,item.module,level=item.level,names=[n.name for n in item.names])
                    except (SyntaxError,RecursionError):warnings.append(relative+': syntax not indexed')
                if path.suffix.lower() in {'.js','.ts','.cjs','.mjs','.tsx','.jsx','.rs'}:
                    for match in re.finditer(r'\b(?:class|function|fn|struct|interface)\s+([A-Za-z_$][\w$]*)',text):
                        reference=concept(match[1],relative,source) if match[0].split()[0] in ('class','struct','interface') else None
                        symbol=node('Symbol',match[1],[relative,match.start()],{**source,'line':text.count('\n',0,match.start())+1},extraction='lexical',ontologyClass=reference);edge(file_id,'declares',symbol)
                    for match in re.finditer(r'''(?:from\s+|require\(\s*|import\s*)['"]([^'"\n]+)['"]''',text):
                        imports.append((file_id,match[1]))
                if path.suffix.lower()=='.rst':
                    lines=text.splitlines();literal_until=-1
                    for index,line in enumerate(lines):
                        if index<literal_until:continue
                        if line.strip().endswith('::') and not line.lstrip().startswith('..'):
                            depth=len(line)-len(line.lstrip());end=index+1
                            while end<len(lines) and (not lines[end].strip() or len(lines[end])-len(lines[end].lstrip())>depth):end+=1
                            literal_until=end;continue
                        match=re.match(r'^( *)\.\. ([\w-]+)::\s*(.*)$',line)
                        if not match:continue
                        indent=len(match[1]);end=index+1
                        while end<len(lines) and (not lines[end].strip() or len(lines[end])-len(lines[end].lstrip())>indent):end+=1
                        if match[2] in {'code','code-block','raw','literalinclude','parsed-literal'}:literal_until=end;continue
                        block='\n'.join(lines[index+1:end]);identifier=re.search(r'^\s+:id:\s*(\S+)\s*$',block,re.M)
                        if not identifier:continue
                        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',identifier[1]):warnings.append(relative+': unsupported need ID');continue
                        if identifier[1] in needs:
                            warnings.append(relative+': duplicate need ID '+identifier[1]);continue
                        need=node('Need',match[3] or identifier[1],identifier[1],{**source,'line':index+1},needId=identifier[1],needType=match[2]);needs[identifier[1]]=need;edge(file_id,'declares',need)
                        for relation in ('links','depends_on','implements','tests','blocks'):
                            option=re.search(r'^\s+:'+relation+r':\s*(.*)$',block,re.M)
                            if option:links.extend((need,'depends_on' if relation=='links' else relation,target) for target in re.split(r'[,;\s]+',option[1].strip()) if target)
            for identity,path,name in inheritance:
                if (path,name) in definitions:edge(identity,'inherits',definitions[(path,name)])
            for identity,path,name in calls:
                if (path,name) in definitions:edge(identity,'calls',definitions[(path,name)])
            resolved,import_warnings=python_imports.resolve();warnings.extend(import_warnings)
            for reference in resolved:
                target=reference['target']
                if target is None:target=node('Module',reference['label'],reference['label'],extraction='python-ast-reference',resolution='ambiguous' if reference['ambiguous'] else 'external-or-unindexed',candidates=reference['candidates'])
                edge(reference['source'],'imports',target)
            for source,module in imports:
                target=modules.get(module)
                if target is None:target=node('Module',module,module)
                edge(source,'imports',target)
            for source,relation,identifier in links:
                target=needs.get(identifier)
                if target is None:target=node('Need',identifier,identifier,unresolved=True)
                edge(source,relation,target)
            for item in runtime.skills.list(limit=100).get('skills',[]) if runtime.skills else []:
                target=node('Skill',item['name'],item['id'],skillId=item['id'],revision=item['revision']);edge(root,'contains',target)
            library=getattr(runtime,'tool_library',None)
            if library:
                tools={}
                for item in library.list()['items']:
                    tools[item['id']]=node('Tool',item['name'],item['id'],toolId=item['id'],revision=item['revision'],sha256=item['sha256']);edge(root,'contains',tools[item['id']])
                for item in library.list('targets')['items']:
                    target=node('Target',item['name'],item['id'],targetId=item['id'],revision=item['revision']);edge(root,'contains',target)
                    if item['tool'] in tools:edge(target,'uses',tools[item['tool']])
            record=dict(format=FORMAT,version=1,ontology=schema,nodes=list(nodes.values()),edges=list({e['id']:e for e in edges if e['source'] in nodes and e['target'] in nodes}.values()),complete=not warnings,warnings=warnings[:100],extraction='static-reference-data-v2',annotations={key:value for key,value in previous.get('annotations',{}).items() if key in nodes},**({'importedFrom':previous['importedFrom']} if 'importedFrom' in previous else {}))
            signature=digest(record)
            old={k:v for k,v in previous.items() if k not in ('project','revision')}
            if signature==digest(old):return previous
            return self.save(project,record,previous['revision'])

    def recall(self,project,query='',limit=12,**options):
        record=self.load(project)
        result=query_graph(record,query=query,limit=limit,**options)
        current_hashes={n['source']['path']:n['source']['sha256'] for n in record['nodes'] if n.get('origin')=='derived' and n.get('source',{}).get('path') and n.get('source',{}).get('sha256')}
        for n in result['nodes']:
            source=n.get('source',{});known=current_hashes.get(source.get('path'))
            n['sourceStatus']='current-index-snapshot' if known and known==source.get('sha256') else 'stale-reference' if known and source.get('sha256') else 'reference-only'
        return result

    def context_provider(self,project,*,runtime=None,**options):
        project=self.project(project)
        def provider(state,cancel=None):
            if cancel is not None and cancel.is_set():raise InterruptedError('Project graph context cancelled')
            if runtime is not None:self.refresh(runtime,project)
            return dict(projectKnowledge=self.recall(project,query=options.get('query',state.get('goal','')),**{k:v for k,v in options.items() if k!='query'}))
        return provider

    def dispatch(self,data,runtime=None):
        project=self.project(data.get('project'));action=data.get('action','export')
        if action=='refresh':return self.refresh(runtime,project)
        record=self.load(project)
        if action=='export':return record
        if action=='ontology':return {**record['ontology'],'project':project,'revision':record['revision']}
        if action=='query':return self.recall(project,data.get('query',''),limit=data.get('limit',12),node_ids=data.get('nodeIds',[]),hops=data.get('hops',1),direction=data.get('direction','both'),relations=data.get('relations',[]),fallback=data.get('fallback','inventory'))
        if action=='stats':return dict(project=project,revision=record['revision'],nodes=len(record['nodes']),edges=len(record['edges']),classes=len(record['ontology']['classes']),complete=record['complete'],warnings=record['warnings'],origins={origin:sum(n.get('origin')==origin for n in record['nodes']) for origin in ('derived','imported','manual')})
        if action=='history':
            with closing(self.memory.connect()) as db:rows=db.execute('SELECT record,created FROM project_graph_history WHERE project=? ORDER BY rowid DESC LIMIT 100',(digest(project),)).fetchall()
            return dict(project=project,items=[{**json.loads(row[0]),'createdAt':row[1]} for row in rows])
        if action in ('annotate','forget','relate'):
            identity=data.get('nodeId');node=next((n for n in record['nodes'] if n['id']==identity),None)
            if not node:raise ValueError('Select a current graph node')
            if action=='annotate':
                text=data.get('text')
                if not isinstance(text,str) or len(text)>4000:raise ValueError('Graph annotation exceeds 4,000 characters')
                record.setdefault('annotations',{})[identity]=dict(text=text,updatedAt=time.time(),status='host-reference')
            elif action=='forget':
                if node.get('origin')=='derived':raise ValueError('Derived nodes are rebuilt from source; annotate them instead')
                record['nodes']=[n for n in record['nodes'] if n['id']!=identity];record['edges']=[e for e in record['edges'] if identity not in (e['source'],e['target'])];record.get('annotations',{}).pop(identity,None)
            else:
                target=data.get('target');relation=data.get('relation')
                if not any(n['id']==target for n in record['nodes']) or relation not in {r['id'] for r in record['ontology']['relations']}:raise ValueError('Unknown graph endpoint or relation')
                edge=dict(id=digest([identity,relation,target])[:32],source=identity,target=target,type=relation,origin='manual')
                if not any(e['id']==edge['id'] for e in record['edges']):record['edges'].append(edge)
            return self.save(project,record,data.get('expectedRevision'),action)
        if action=='import':
            payload=data.get('payload')
            if not isinstance(payload,dict):raise ValueError('Import needs an object')
            schema=validate_ontology(payload.get('ontology',record['ontology']))
            graph=validate_graph(payload,schema)
            return self.save(project,{**graph,'ontology':schema,'importedFrom':payload.get('project','')},data.get('expectedRevision'),'import')
        if action=='import_ontology':
            schema=validate_ontology(data.get('payload'))
            validate_graph(record,schema)
            return self.save(project,{**record,'ontology':schema},data.get('expectedRevision'),'import_ontology')
        raise ValueError('Unsupported knowledge action')
