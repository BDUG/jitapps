"""Server-side task DAG and action-binding validation, matching the browser contract."""
def validate(tasks):
    if not isinstance(tasks,list) or len(tasks)>30:raise ValueError('Use up to 30 tasks')
    out=[];ids=set();active=0
    for task in tasks:
        if not isinstance(task,dict) or not isinstance(task.get('id'),str) or not task['id'] or len(task['id'])>80 or task['id'] in ids or not isinstance(task.get('title'),str) or not task['title'].strip() or len(task['title'])>300 or task.get('status') not in {'pending','in_progress','done','blocked'}:raise ValueError('Invalid or duplicate task')
        deps=task.get('dependsOn',[])
        if not isinstance(deps,list) or any(not isinstance(d,str) for d in deps) or len(set(deps))!=len(deps):raise ValueError('Task dependencies must be unique IDs')
        ids.add(task['id']);active+=task['status']=='in_progress';out.append({k:task[k] for k in ('id','title','status','dependsOn') if k in task})
    if active>1:raise ValueError('Use one active task')
    by_id={t['id']:t for t in out};visiting=set();done=set()
    def visit(ident):
        if ident in visiting:raise ValueError('Task dependency cycle')
        if ident in done:return
        visiting.add(ident)
        for dep in by_id[ident].get('dependsOn',[]):
            if dep not in by_id or dep==ident:raise ValueError('Unknown or self task dependency')
            visit(dep)
        visiting.remove(ident);done.add(ident)
    for task in out:visit(task['id'])
    for task in out:
        if task['status'] in {'in_progress','done'} and any(by_id[d]['status']!='done' for d in task.get('dependsOn',[])):raise ValueError('Complete task prerequisites first')
    return out

def latest(events):return next((e['value']['tasks'] for e in reversed(events) if e['kind']=='assistant' and isinstance(e.get('value'),dict) and isinstance(e['value'].get('tasks'),list)),[])
def action(tasks,task_id):
    tasks=validate(tasks)
    if not any(t.get('dependsOn') for t in tasks) and task_id is None:return
    task=next((t for t in tasks if t['id']==task_id),None)
    if not task or task['status']!='in_progress':raise ValueError('Bind action.taskId to the ready in_progress task')
