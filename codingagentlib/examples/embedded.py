from codingagentlib import EmbeddedAgent
agent=EmbeddedAgent(context={'application':'example'},on_event=lambda event:print(event['kind']))
agent.add_tool('greet',lambda args,ctx:{'message':'Hello '+args['name'],'callId':ctx['callId']},description='Greet a person; args:{name:string}')
def model(request):
    done=any(e['kind']=='observation' for e in request['events'])
    return {'sessionId':request['sessionId'],'step':request['step'],'status':'done' if done else 'act','plan':'Use the host greeting tool','action':None if done else {'tool':'greet','args':{'name':'developer'}},'summary':'Greeting observed'}
print(agent.run('Greet the developer',model))
