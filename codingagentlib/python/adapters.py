"""Explicit migration adapter; old EmbeddedAgent wire formats stay unchanged."""
from .core import create_agent


def from_embedded(embedded, *, model, **options):
    if embedded.busy:
        raise ValueError('Embedded agent is busy')
    tools = []
    extra_policy=options.pop('policy',{})
    for tool in embedded.tools.values():
        definition = {k:v for k,v in tool.items() if k != 'handler'}
        tools.append({**definition,'execute':lambda args,ctx,handler=tool['handler']:handler(args,{**ctx,'context':ctx['context'][0]}),'available':lambda context,state,tool=definition:embedded.tools.get(tool['name'],{}).get('enabled') is True and embedded.tool_available(tool,context[0],state)})
    return create_agent(**options,model=model,tools=tools,context_providers=[lambda state,cancel:embedded.context_provider(state,cancel) if embedded.context_provider else embedded.context],policy={**extra_policy,'authorize':lambda action,state:embedded.before_tool({k:v for k,v in embedded.tools[action['tool']].items() if k!='handler'},action['args']) is True and ('authorize' not in extra_policy or extra_policy['authorize'](action,state) is True),'complete':lambda response,state:embedded.before_finish(response,state) is True and ('complete' not in extra_policy or extra_policy['complete'](response,state) is True)},on_event=embedded.on_event)
