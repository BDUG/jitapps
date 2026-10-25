"""Same-origin catalog management and relay retrieval helpers."""
import json
from server.skill_catalog import app_id, NOTICE

def dispatch(catalog,data):
    op=data.get('op','status');app=data.get('app','codeiX')
    if op=='status':return catalog.status()
    if op=='search':return catalog.search(data.get('query',''),data.get('kind'),data.get('cursor',0),data.get('limit',20),source=data.get('source'))
    if op=='read':return catalog.read(data.get('id'),data.get('offset',0),data.get('limit',12000),data.get('contentHash'),app=data.get('app'))
    if op=='profile':
        profile=catalog.profile(app)
        items=[]
        for id in profile['selected']:
            try:items.append(catalog.metadata(catalog.read(id,limit=1,app=app)))
            except ValueError:items.append({'id':id,'name':id,'kind':'missing'})
        return {'profile':profile,'defaults':catalog.defaults(app),'selected':items}
    if op=='history':return catalog.history(app,data.get('cursor',0),data.get('limit',20))
    if op=='save':return catalog.save_profile(app,data.get('profile',{}))
    if op=='context':return catalog.context(app,data.get('query',''))
    if op=='refresh':return catalog.request_refresh(data.get('source'))
    if op=='resolve':return catalog.resolve(data.get('id'),force=data.get('refresh') is True)
    raise ValueError('Unknown skill catalog operation')

def augment(catalog,data,messages):
    if not isinstance(messages,list) or not messages or any(not isinstance(m,dict) for m in messages):return messages,None
    app=data.get('app')
    # Legacy callers remain compatible. Explicit app metadata survives paging.
    if app is None:
        for message in reversed(messages):
            if message.get('role')!='user':continue
            try:
                parsed=json.loads(message.get('content','') if isinstance(message.get('content'),str) else next((p.get('text','') for p in message.get('content',[]) if isinstance(p,dict) and p.get('type')=='text'),''))
                app=parsed.get('tool') or parsed.get('appEditing',{}).get('tool')
                if not app and str(parsed.get('protocol','')).startswith('codeix'):app='codeiX'
            except (ValueError,TypeError,AttributeError):pass
            break
    if app is None:return messages,None
    app_id(app)
    query=''
    for message in reversed(messages):
        if message.get('role')!='user':continue
        content=message.get('content','')
        if isinstance(content,list):content=next((p.get('text','') for p in content if isinstance(p,dict) and p.get('type')=='text'),'')
        if not isinstance(content,str):continue
        try:
            parsed=json.loads(content)
            query=parsed.get('task') or parsed.get('goal') or parsed.get('source',{}).get('text') or content[-4000:]
        except (ValueError,TypeError,AttributeError):query=content[-4000:]
        break
    context=catalog.context(app,str(query)[:8000])
    if not context.get('skills') and not context.get('references'):return messages,context
    insertion={'role':'user','content':json.dumps({'retrievedSkillContext':context,'handling':NOTICE})}
    return [*messages[:-1],insertion,*messages[-1:]],context
