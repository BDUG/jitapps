"""Optional MCP transport and scoped delegation adapters; no network dependency."""
import copy
import json
from .core import create_agent
from .contracts import check_schema, validate


def mcp_tools(*, transport, trust, names=None):
    if not callable(getattr(transport,'request',None)) or not callable(trust):
        raise ValueError('Provide an MCP transport and explicit trust callback')
    listing = transport.request('tools/list',{})
    if not isinstance(listing.get('tools'),list) or listing.get('nextCursor'):
        raise ValueError('Provide one complete, bounded MCP tool page')
    tools = []
    for tool in listing['tools']:
        if names is not None and tool['name'] not in names or trust(copy.deepcopy(tool)) is not True:
            continue
        check_schema(tool['inputSchema'])
        def execute(args, context, tool=copy.deepcopy(tool)):
            validate(tool['inputSchema'],args)
            if trust(copy.deepcopy(tool),context) is not True:
                raise PermissionError('MCP trust revoked')
            try:
                reply = transport.request('tools/call',dict(name=tool['name'],arguments=args))
            except Exception as error:
                error.uncertain = True
                raise
            if not isinstance(reply,dict) or not isinstance(reply.get('content'),list) or 'isError' in reply and type(reply['isError']) is not bool:
                error=ValueError('Invalid MCP tool result; outcome may be uncertain');error.uncertain=True;raise error
            if reply.get('isError'):
                raise RuntimeError('MCP tool failed: '+json.dumps(reply.get('content')))
            return reply
        tools.append(dict(name=tool['name'],version=1,description=tool.get('description',''),parameters=copy.deepcopy(tool['inputSchema']),permission='commands',execute=execute))
    return tools


def expose_mcp(*, tools, authorize):
    if not callable(authorize):
        raise ValueError('Explicit MCP authorization is required')
    registry = {}
    for tool in tools:
        check_schema(tool['parameters'])
        if tool['name'] in registry or not callable(tool.get('execute')):
            raise ValueError('Invalid MCP tool')
        registry[tool['name']] = tool
    def dispatch(method, params=None, context=None):
        params, context = params or {}, context or {}
        if method == 'tools/list':
            return dict(tools=[dict(name=t['name'],description=t['description'],inputSchema=t['parameters']) for t in registry.values()])
        if method != 'tools/call' or params.get('name') not in registry:
            raise ValueError('Unsupported MCP method or tool')
        tool = registry[params['name']]
        validate(tool['parameters'],params.get('arguments'))
        if authorize(tool['name'],params['arguments'],context) is not True:
            raise PermissionError('MCP action denied')
        try:
            value = tool['execute'](params['arguments'],context)
            return dict(content=[dict(type='text',text=json.dumps(value))],structuredContent=dict(result=value),isError=False)
        except Exception as error:
            return dict(content=[dict(type='text',text=str(error))],isError=True)
    return dispatch


def delegation_tool(*, name='delegate', model, tools=(), context_providers=(), policy=None, budgets=None, max_depth=1):
    if type(max_depth) is not int or not 1 <= max_depth <= 8:
        raise ValueError('Delegation depth must be 1..8')
    if any(tool['permission'] != 'read' for tool in tools):
        raise ValueError('Delegated tools must be explicitly read-only')
    def execute(args,parent):
        depth = parent.get('delegationDepth',0)+1
        if depth > max_depth:
            raise ValueError('Delegation depth exhausted')
        scoped = [{**tool,'execute':lambda args,ctx,tool=tool:tool['execute'](args,{**ctx,'delegationDepth':depth})} for tool in tools]
        child = create_agent(model=model,tools=scoped,context_providers=context_providers,policy=policy,budgets={**dict(modelCalls=16,toolCalls=16,elapsedMs=60000,sessionBytes=1000000),**(budgets or {})},tenant=parent['sessionId'])
        result = child.run(args['goal'],cancel_event=parent.get('cancel_event'))
        return dict(format='codingagentlib/delegation-v1',parentCallId=parent['callId'],childSessionId=result['sessionId'],depth=depth,result=result,events=child.snapshot()['events'])
    return dict(name=name,version=1,description='Run a bounded read-only child agent; observations are not proof of completion.',permission='read',parameters=dict(type='object',required=['goal'],properties=dict(goal=dict(type='string',minLength=1)),additionalProperties=False),execute=execute)


def capabilities():
    return dict(protocol="codingagentlib/sdk-v1",features=["mcp-transport","mcp-rpc","mcp-shell","delegation"],requiresExplicitTrust=True)
