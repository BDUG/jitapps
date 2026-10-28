"""Bounded, read-only compiler/AST navigation over current guarded workspace snapshots."""
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

MAX_FILE_BYTES=1000000
EXTENSIONS={'.py','.js','.jsx','.ts','.tsx','.mjs','.cjs'}
SERVICE=Path(__file__).with_name('code-navigation')/'service.cjs'
def module_name(path):
    parts=Path(path).with_suffix('').parts
    return '.'.join(parts[:-1] if parts[-1]=='__init__' else parts)
def location(path,node,name=None):
    return {'path':path,'line':node.lineno,'column':node.col_offset+1,'length':len(name or getattr(node,'id',''))}
def page(values,args):
    cursor=args.get('cursor',0);limit=args.get('limit',50)
    if type(cursor) is not int or cursor<0 or type(limit) is not int or not 1<=limit<=200:raise ValueError('Navigation pages use cursor >= 0 and limit 1–200')
    return {'results':values[cursor:cursor+limit],'total':len(values),'nextCursor':min(len(values),cursor+limit),'done':cursor+limit>=len(values)}

class PythonIndex:
    def __init__(self,files):
        self.symbols=[];self.refs=[];self.modules={};self.diagnostics=[]
        for file in files:
            if not file['path'].endswith('.py'):continue
            path=file['path'];mod=module_name(path);scope={'name':mod,'kind':'module','bindings':{},'parent':None,'path':path};self.modules[mod]=scope
            try:tree=ast.parse(file['text'],filename=path)
            except (SyntaxError,RecursionError) as e:
                self.diagnostics.append({'path':path,'line':getattr(e,'lineno',1) or 1,'column':getattr(e,'offset',1) or 1,'severity':'error','code':'python-syntax','message':getattr(e,'msg',str(e))});continue
            index=self;lines=file['text'].splitlines()
            class Visit(ast.NodeVisitor):
                def __init__(self):self.scope=scope
                def loc(self,node,name=None):
                    result=location(path,node,name)
                    if name:
                        line=lines[node.lineno-1];offset=len(line.encode()[:node.col_offset].decode(errors='ignore'));found=line.find(name,offset);result['column']=(found if found>=0 else offset)+1
                    else:result['column']=len(lines[node.lineno-1].encode()[:node.col_offset].decode(errors='ignore'))+1
                    return result
                def bind(self,name,node,kind='variable',target=None):
                    if name in self.scope.get('unsupported',set()):return None
                    symbol={**self.loc(node,name),'name':name,'qualifiedName':self.scope['name']+'.'+name,'kind':kind,'symbolId':path+':'+str(node.lineno)+':'+self.scope['name']+'.'+name}
                    binding={'symbol':symbol,'target':target};self.scope['bindings'][name]=binding;index.symbols.append(symbol);index.refs.append({'location':self.loc(node,name),'scope':self.scope,'binding':binding,'definition':symbol['symbolId']});return binding
                def function(self,node):
                    self.bind(node.name,node,'class' if isinstance(node,ast.ClassDef) else 'function');outer=self.scope
                    for dec in node.decorator_list:self.visit(dec)
                    if isinstance(node,ast.ClassDef):
                        for base in node.bases:self.visit(base)
                    else:
                        for default in [*node.args.defaults,*[v for v in node.args.kw_defaults if v]]:self.visit(default)
                    self.scope={'name':outer['name']+'.'+node.name,'kind':'class' if isinstance(node,ast.ClassDef) else 'function','bindings':{},'parent':outer,'path':path}
                    if not isinstance(node,ast.ClassDef):
                        for arg in [*node.args.posonlyargs,*node.args.args,*node.args.kwonlyargs,*([node.args.vararg] if node.args.vararg else []),*([node.args.kwarg] if node.args.kwarg else [])]:self.bind(arg.arg,arg,'parameter')
                    class Decl(ast.NodeVisitor):
                        def visit_Global(s,node):self.scope.setdefault('unsupported',set()).update(node.names)
                        visit_Nonlocal=visit_Global
                        def visit_FunctionDef(s,node):pass
                        visit_AsyncFunctionDef=visit_FunctionDef;visit_ClassDef=visit_FunctionDef
                    declaration=Decl()
                    for item in node.body:declaration.visit(item)
                    for item in node.body:self.visit(item)
                    self.scope=outer
                visit_FunctionDef=function;visit_AsyncFunctionDef=function;visit_ClassDef=function
                def visit_Name(self,node):
                    if isinstance(node.ctx,ast.Store):self.bind(node.id,node)
                    elif isinstance(node.ctx,ast.Load):index.refs.append({'location':self.loc(node),'scope':self.scope,'node':node})
                def visit_Attribute(self,node):
                    if isinstance(node.ctx,ast.Load):
                        loc=self.loc(node,node.attr);loc['line']=getattr(node,'end_lineno',node.lineno);loc['column']=len(lines[loc['line']-1].encode()[:getattr(node,'end_col_offset',node.col_offset+len(node.attr))].decode(errors='ignore'))-len(node.attr)+1
                        index.refs.append({'location':loc,'scope':self.scope,'node':node})
                    self.visit(node.value)
                def visit_Import(self,node):
                    for alias in node.names:self.bind(alias.asname or alias.name.split('.')[0],node,'import',(alias.name if alias.asname else alias.name.split('.')[0],None))
                def visit_ImportFrom(self,node):
                    base=module_name(path).split('.')[:-1] if Path(path).stem!='__init__' else module_name(path).split('.')
                    target=('__unresolved_relative__' if node.level>len(base) else '.'.join(base[:len(base)-node.level+1]+([node.module] if node.module else []))) if node.level else node.module or ''
                    for alias in node.names:
                        if alias.name!='*':self.bind(alias.asname or alias.name,node,'import',(target,alias.name))
            try:Visit().visit(tree)
            except RecursionError:self.diagnostics.append({'path':path,'line':1,'column':1,'severity':'error','code':'python-analysis-limit','message':'AST nesting exceeds the analysis limit.'})
        for ref in self.refs:ref['resolved']=self.deref(ref.get('binding') or self.resolve(ref.get('node'),ref['scope']))
    def deref(self,binding,seen=None):
        if not binding:return None
        seen=set() if seen is None else seen
        if id(binding) in seen:return None
        seen.add(id(binding));target=binding.get('target')
        if target:
            mod,name=target
            if name is None:return {'module':mod}
            if mod+'.'+name in self.modules:return {'module':mod+'.'+name}
            return self.deref(self.modules.get(mod,{}).get('bindings',{}).get(name),seen)
        return binding
    def resolve(self,node,scope):
        if isinstance(node,ast.Name):
            current=scope
            while current:
                if node.id in current.get('unsupported',set()):return None
                if node.id in current['bindings']:return current['bindings'][node.id]
                current=current['parent']
                if scope['kind']=='function' and current and current['kind']=='class':current=current['parent']
        if isinstance(node,ast.Attribute):
            base=self.deref(self.resolve(node.value,scope))
            if base and 'module' in base:
                module=base['module'];binding=self.modules.get(module,{}).get('bindings',{}).get(node.attr)
                return binding or ({'module':module+'.'+node.attr} if module+'.'+node.attr in self.modules else None)
        return None
    def query(self,op,args):
        path=args.get('path');query=args.get('query','').casefold()
        if op=='symbols':return [s for s in self.symbols if (not path or s['path']==path or s['path'].startswith(path.rstrip('/')+'/')) and query in s['qualifiedName'].casefold()]
        if op=='diagnostics':return [d for d in self.diagnostics if d['path']==path]
        line=args.get('line');column=args.get('column')
        matches=[r for r in self.refs if r['location']['path']==path and r['location']['line']==line and r['location']['column']<=column<r['location']['column']+max(1,r['location']['length'])]
        if not matches:return []
        target=matches[-1]['resolved'];symbol=target and target.get('symbol')
        if not symbol:return []
        if op=='definition':return [symbol]
        return [{**r['location'],'isDefinition':r.get('definition')==symbol['symbolId']} for r in self.refs if r['resolved'] and r['resolved'].get('symbol',{}).get('symbolId')==symbol['symbolId']]

class Navigation:
    def __init__(self,service_dir=None):
        self.service=(Path(service_dir).expanduser().resolve()/'service.cjs') if service_dir else SERVICE
        self.node=shutil.which('node');self.compiler=self.service.parent/'node_modules/typescript';self.trusted={}
        required=[self.service,self.compiler/'package.json',self.compiler/'lib/typescript.js']
        if self.service.is_file() and b"require('../../codingagentlib/python/code-navigation/service.cjs')" in self.service.read_bytes():required.append((self.service.parent/'../../codingagentlib/python/code-navigation/service.cjs').resolve())
        self.required=tuple(required)
        self._python_snapshot=None
        for path in self.required:
            if path.is_file():self.trusted[path]=(path.resolve(),path.stat().st_size,hashlib.sha256(path.read_bytes()).hexdigest())
        self.private_paths={p.resolve() for p in self.required}
    def verify(self):
        if len(self.trusted)!=len(self.required):raise ValueError('Install TypeScript navigation dependencies, then restart the server')
        for path,(resolved,size,digest) in self.trusted.items():
            if path.is_symlink() or path.resolve()!=resolved or path.stat().st_size!=size:raise ValueError('Trusted navigation files changed; restart after reviewing updates')
            with path.open('rb') as source:
                hasher=hashlib.sha256()
                for chunk in iter(lambda:source.read(1048576),b''):hasher.update(chunk)
                value=hasher.hexdigest()
            if value!=digest:raise ValueError('Trusted navigation files changed; restart after reviewing updates')
    def health(self):return {'python':'builtin-ast','javascriptTypescript':'typescript-language-service' if self.node and len(self.trusted)==len(self.required) else 'unavailable; prepare TypeScript in '+str(self.service.parent)+' with npm ci, then restart','limits':{'files':400,'fileBytes':MAX_FILE_BYTES,'totalBytes':8000000}}
    def run(self,runtime,op,args):
        requested=args.get('path');query=args.get('query','')
        if not isinstance(query,str) or len(query)>500:raise ValueError('Use a symbol query under 500 characters')
        if requested:runtime.path(requested)
        if op!='symbols' and (not requested or Path(requested).suffix not in EXTENSIONS):raise ValueError('Choose a supported source file')
        if op in {'definition','references'} and (type(args.get('line')) is not int or args['line']<1 or type(args.get('column')) is not int or args['column']<1):raise ValueError('Source positions use one-based line and column')
        candidates=[p for p in runtime.files() if p.suffix in EXTENSIONS and not any(part in {'vendor','dist','build','backup'} for part in p.relative_to(runtime.root).parts)];candidates.sort(key=lambda p:(not (str(p.relative_to(runtime.root))==requested or requested and str(p.relative_to(runtime.root)).startswith(requested.rstrip('/')+'/')),str(p)))
        files=[];size=0;skipped=0
        for path in candidates:
            relative=str(path.relative_to(runtime.root)).replace('\\','/')
            try:length=path.stat().st_size
            except OSError:skipped+=1;continue
            if len(files)>=400 or length>MAX_FILE_BYTES or size+length>8000000:skipped+=1;continue
            try:
                with path.open('rb') as source:data=source.read(MAX_FILE_BYTES+1)
                if len(data)>MAX_FILE_BYTES or size+len(data)>8000000:skipped+=1;continue
                text=data.decode('utf-8')
            except (OSError,UnicodeError):skipped+=1;continue
            files.append({'path':relative,'text':text,'hash':hashlib.sha256(data).hexdigest()});size+=len(data)
        hashes={f['path']:f['hash'] for f in files};result=[];engines=[];notes=[]
        if op=='symbols' or requested.endswith('.py'):
            # Re-read and hash sources above; reuse only an identical Python snapshot.
            sources=[f for f in files if f['path'].endswith('.py')]
            key=tuple((f['path'],f['hash']) for f in sources)
            cached=self._python_snapshot
            if cached is None or cached[0]!=key:
                python=PythonIndex(sources);self._python_snapshot=(key,python)
            else:python=cached[1]
            result.extend(dict(item) for item in python.query(op,args));engines.append('python-ast');notes.append('Python resolves lexical scopes and explicit workspace imports; dynamic attributes, wildcard imports, global/nonlocal rebinding and runtime types are not resolved.')
        if op=='symbols' or not requested.endswith('.py'):
            js=[f for f in files if not f['path'].endswith('.py')]
            if js:
                if self.health()['javascriptTypescript']!='typescript-language-service':
                    if op!='symbols':raise ValueError('Install the TypeScript language service: npm ci --prefix server/code-navigation')
                    notes.append('JS/TS navigation unavailable: install server/code-navigation dependencies.')
                else:
                    self.verify()
                    process=subprocess.run([self.node,str(self.service)],input=json.dumps({'op':op,**args,'files':js}),text=True,capture_output=True,timeout=20,cwd=str(self.service.parent),env={k:v for k,v in os.environ.items() if k not in {'NODE_OPTIONS','NODE_PATH'}})
                    try:data=json.loads(process.stdout)
                    except ValueError:raise ValueError('Compiler service returned no valid result') from None
                    if process.returncode or data.get('error'):raise ValueError(data.get('error','Compiler navigation failed'))
                    result.extend(data['results']);engines.append(data['engine']);notes.append(data['note'])
        result.sort(key=lambda r:(r['path'],r.get('line',0),r.get('column',0)))
        for item in result:item['hash']=hashes.get(item['path'])
        return {**page(result,args),'engines':engines,'coverage':{'indexedFiles':len(files),'skippedFiles':skipped,'bytes':size,'complete':not skipped},'note':' '.join(notes)+' Results describe this snapshot, not executed behavior.'}
