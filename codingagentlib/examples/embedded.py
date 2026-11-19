from codingagentlib import create_agent

def model(request):
    done=any(event['kind']=='tool_result' for event in request['events'])
    return dict(sessionId=request['sessionId'],step=request['step'],status='done' if done else 'act',plan='Use the registered greeting tool',action=None if done else dict(tool='greet',args=dict(name='developer')),summary='Greeting observed')

agent=create_agent(model=model,tools=[dict(name='greet',version=1,description='Greet a person',permission='read',parameters=dict(type='object',required=['name'],properties=dict(name=dict(type='string')),additionalProperties=False),execute=lambda args,ctx:dict(message='Hello '+args['name'],callId=ctx['callId']))],on_event=lambda event:print(event['kind']))
print(agent.run('Greet the developer'))
