"""Run with python3 -m codingagentlib.examples.dynamic_context from the repo root."""
from codingagentlib import EmbeddedAgent, ContextRegistry
project={'revision':1,'selection':'README.md'}
contexts=ContextRegistry(base={'application':'custom-editor'}).add('project',lambda state,cancel:{'revision':str(project['revision']),'data':dict(project)},schema={'type':'object'})
agent=EmbeddedAgent(context_provider=contexts.provider(),on_event=lambda e:print(e['kind']))
def select(args,turn):
    expected=turn['context']['sources'][0]['revision']
    if expected!=str(project['revision']):raise ValueError('Refresh and adapt: project changed')
    project.update(revision=project['revision']+1,selection=args['file'])
    return dict(project)
agent.add_tool('select_file',select,description='Change the host editor selection',parameters={'type':'object','required':['file']})
def model(request):
    first=request['step']==1
    return {'sessionId':request['sessionId'],'step':request['step'],'plan':'Update selection and inspect fresh context','status':'act' if first else 'done','action':{'tool':'select_file','args':{'file':'main.js'}} if first else None,'summary':'New context revision '+request['context']['sources'][0]['revision']}
if __name__=='__main__':print(agent.run('Select main.js',model))
