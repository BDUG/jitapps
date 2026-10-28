"""Package recorded evidence and actual changed files; does not deploy or execute."""
from . import agent_acceptance, agent_checks
import difflib
import hashlib
import json
from pathlib import Path
import uuid
import zipfile


def build(runtime,session):
    changes=runtime.changes(session)['changes'];folder=runtime.path('packages',base=session['_dir'],private=True);folder.mkdir(exist_ok=True)
    temporary=folder/('result-'+uuid.uuid4().hex+'.tmp');destination=folder/'result.zip'
    manifest={'format':'suite-agent-result/v1','session':session['id'],'goal':session['goal'],'status':session['status'],'files':[],'deleted':[],'warnings':[]}
    def entry(archive,name,data):
        payload=data.encode('utf-8') if isinstance(data,str) else data;archive.writestr(name,payload)
        manifest['files'].append({'path':name,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
    def file(archive,name,source,expected=None):
        digest=hashlib.sha256();size=0
        with source.open('rb') as incoming,archive.open(name,'w',force_zip64=True) as out:
            for part in iter(lambda:incoming.read(65536),b''):out.write(part);digest.update(part);size+=len(part)
        signature=digest.hexdigest()
        if expected and signature!=expected:raise ValueError('Workspace changed while packaging. Refresh changes and try again.')
        manifest['files'].append({'path':name,'bytes':size,'sha256':signature})
    try:
        with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,allowZip64=True) as archive:
            events=session['events'];completion=next((e['value'] for e in reversed(events) if e['kind']=='completion'),{})
            tasks=next((e['value'].get('tasks',[]) for e in reversed(events) if e['kind']=='assistant' and isinstance(e.get('value'),dict) and isinstance(e['value'].get('tasks'),list)),[])
            entry(archive,'session.json',json.dumps(runtime.public(session),ensure_ascii=False,indent=2))
            entry(archive,'tasks.json',json.dumps(tasks,ensure_ascii=False,indent=2))
            entry(archive,'changes.json',json.dumps(changes,ensure_ascii=False,indent=2))
            evidence={'completion':completion,'jobs':session['jobs'],'note':'Recorded command exits and model-reported verification; not an independent certification.'}
            entry(archive,'verification.json',json.dumps(evidence,ensure_ascii=False,indent=2))
            checked=[{'callId':e['value']['id'],'tool':e['value']['tool'],**e['value']['checks']} for e in events if e['kind']=='observation' and isinstance(e.get('value',{}).get('checks'),dict)]
            entry(archive,'acceptance.json',json.dumps({'rules':session.get('acceptanceRules',[]),'report':agent_acceptance.evaluate(session.get('acceptanceRules'),events)},ensure_ascii=False,indent=2))
            check_state=agent_checks.history(events)
            entry(archive,'action-checks.json',json.dumps({'observations':checked,'checkedActions':len(checked),'passed':sum(c['passed'] for c in checked),'failed':sum(not c['passed'] for c in checked),'latestPassed':checked[-1]['passed'] if checked else None,'currentPassed':check_state['passed'],'unresolved':check_state['unresolved'],'note':'Declarative checks against returned JSON values/pages/previews; not certification of task correctness.'},ensure_ascii=False,indent=2))
            try:entry(archive,'memory.json',json.dumps(runtime.memory.export(session['id']),ensure_ascii=False,indent=2))
            except Exception as error:manifest['warnings'].append('Memory export unavailable: '+type(error).__name__)
            references=[]
            for event in events:
                value=event.get('value',{})
                if event['kind']=='observation' and value.get('ok') and value.get('tool') in {'skill_save','skill_read'}:
                    record=value.get('result',{});references.append((record['id'],record['revision']))
                elif event['kind']=='user_action' and value.get('operation') in {'skill_save','skill_read'}:
                    references.append((value['id'],value['revision']))
            skills=[]
            for reference in sorted(set(references)):
                try:skills.extend(runtime.skills.export([reference]))
                except Exception as error:manifest['warnings'].append('Skill revision unavailable: '+reference[0]+' v'+str(reference[1])+' ('+type(error).__name__+')')
            workflow_refs=set()
            for event in events:
                value=event.get('value',{})
                if event['kind']=='observation' and value.get('ok') and value.get('tool') in {'workflow_read','workflow_save'}:
                    record=value.get('result',{});workflow_refs.add((record['id'],record['revision']))
                elif event['kind']=='user_action' and value.get('operation') in {'workflow_read','workflow_save'}:workflow_refs.add((value['id'],value['revision']))
            workflows=[]
            for ident,rev in sorted(workflow_refs):
                try:workflows.append(runtime.workflows.read(ident,rev))
                except Exception as error:manifest['warnings'].append('Workflow revision unavailable: '+ident+' v'+str(rev)+' ('+type(error).__name__+')')
            entry(archive,'workflows.json',json.dumps(workflows,ensure_ascii=False,indent=2))
            entry(archive,'workflow-executions.json',json.dumps(session.get('workflowRuns',{}),ensure_ascii=False,indent=2))
            entry(archive,'skills.json',json.dumps(skills,ensure_ascii=False,indent=2))
            for skill in skills:
                markdown='---\nname: '+json.dumps(skill['name'],ensure_ascii=False)+'\ndescription: '+json.dumps(skill['description'],ensure_ascii=False)+'\n---\n\n'+skill['content']
                entry(archive,'skills/'+skill['id']+'/v'+str(skill['revision'])+'/SKILL.md',markdown)
            diff=[]
            for change in changes:
                relative=change['path'];current=runtime.path(relative)
                if change['status']=='deleted':
                    if current.exists():raise ValueError('A deleted file reappeared while packaging. Try again.')
                    manifest['deleted'].append(relative)
                else:file(archive,'changes/'+relative,current,change['hash'])
                backup=session['backups'].get(relative);old_path=runtime.path(backup['id'],base=runtime.path('backups',base=session['_dir'],private=True),private=True) if backup and backup['existed'] else None
                if old_path is not None and not old_path.is_file():manifest['warnings'].append('Recovery original unavailable for diff: '+relative);old_path=None
                if change['status']=='modified' and old_path is None:manifest['warnings'].append('Original content unavailable for diff: '+relative);continue
                if change['status']=='deleted' and old_path is None:continue
                if (current.exists() and current.stat().st_size>2000000) or (old_path and old_path.stat().st_size>2000000):manifest['warnings'].append('Diff omitted for large file; current bytes are included where available: '+relative);continue
                try:
                    old=old_path.read_text(encoding='utf-8') if old_path else '';new='' if change['status']=='deleted' else current.read_text(encoding='utf-8')
                    diff.extend(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='a/'+relative,tofile='b/'+relative))
                except UnicodeError:manifest['warnings'].append('Binary content has no text diff: '+relative)
            entry(archive,'changes.patch',''.join(diff))
            contexts=runtime.path('contexts',base=session['_dir'],private=True)
            if contexts.exists():
                for source in sorted(contexts.glob('*.json')):
                    safe=runtime.path(source.name,base=contexts,private=True)
                    file(archive,'context/'+source.name,safe,source.stem)
            current=session.get('contextSnapshot')
            if current:
                source=runtime.path(current+'.json',base=contexts,private=True)
                with source.open(encoding='utf-8') as stream:context=json.load(stream)
                document=context.get('project',context.get('document')) if isinstance(context,dict) else None
                if document is not None and context.get('tool')==session['tool']:
                    label=''.join(c if c.isalnum() or c in '-_' else '_' for c in session['tool']) or 'current-project'
                    entry(archive,'project/'+label+'.json',json.dumps(document,ensure_ascii=False,indent=2))
                    manifest['project']={'tool':session['tool'],'snapshot':current,'source':'browser project snapshot, separate from relay workspace changes'}
                    if session['tool']=='codeiX' and isinstance(document,dict):
                        for item in document.get('files',[]):
                            path=item.get('path');content=item.get('content')
                            if not isinstance(path,str) or not path or Path(path).is_absolute() or '..' in Path(path).parts or '\\' in path or not isinstance(content,str):raise ValueError('Invalid browser project file in result package')
                            entry(archive,'project/files/'+path,content)
            scripts=runtime.path('scripts',base=session['_dir'],private=True)
            if scripts.exists():
                for source in sorted(scripts.rglob('*')):
                    if source.is_file() and not source.is_symlink():
                        safe=runtime.path(str(source.relative_to(scripts)),base=scripts,private=True);file(archive,'scripts/'+str(source.relative_to(scripts)).replace('\\','/'),safe)
            for job in session['jobs']:
                for stream in ('stdout','stderr'):
                    source=runtime.path(job+'.'+stream,base=runtime.path('logs',base=session['_dir'],private=True),private=True)
                    if source.exists():file(archive,'logs/'+job+'.'+stream,runtime.path(source.name,base=source.parent,private=True))
            summary='# Coding agent result\n\n'+session['goal']+'\n\nStatus: '+session['status']+'\n\n'+str(completion.get('summary','No completion summary recorded; this may be an intermediate package.'))+'\n\n## Contents\n\n- project/: latest archived current browser project and codeiX source files, when available.\n- changes/: actual changed/new files; deleted paths are listed in changes.json and manifest.json.\n- changes.patch: best-effort textual diff, using file-tool recovery copies where available.\n- context/: original browser app-context snapshots referenced by compressed views.\n- skills/: exact Markdown revisions read or saved during this run; skills.json records provenance.\n- scripts/: managed working scripts.\n- logs/: complete retained stdout/stderr, not only previews.\n- memory.json: session vector-memory text/metadata; vectors can be rebuilt locally.\n- acceptance.json: immutable run acceptance rules and current recorded-result evaluation.\n- action-checks.json: recorded machine-checkable expectations and their actual outcomes.\n- session.json, tasks.json, verification.json: audit trail and recorded evidence.\n- manifest.json: SHA-256 and byte size for each packaged payload, plus warnings.\n\nThis package does not deploy, apply changes, restore command side effects or certify test coverage. Only changed workspace files are included, so it is not necessarily a standalone build. Provider configuration, the raw cross-session memory DB, private runtime backups and unchanged workspace files are excluded. Tool output and changed project files may contain your own private data; inspect before sharing.\n'
            entry(archive,'RESULT.md',summary)
            archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        temporary.replace(destination);return destination
    finally:temporary.unlink(missing_ok=True)
