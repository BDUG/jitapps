"""Explicit JSON-RPC/MCP stdio service for project memory, skills and coding tools."""
import argparse
import json
import sys
from . import Runtime


class MCPService:
    def __init__(self,runtime,*,allow_edits=False,allow_commands=False):
        self.runtime=runtime;self.initialized=False
        self.session=runtime.dispatch(dict(op='start',goal='Serve explicitly configured MCP tools',allowEdits=allow_edits,allowCommands=allow_commands))['id']
        self.calls=0;self.identities=set()

    def request(self,method,params):
        if method=='initialize':
            version=params.get('protocolVersion','2025-03-26')
            # MCP initialization negotiates a supported version rather than
            # rejecting a newer client's proposal before it can negotiate.
            if version not in ('2024-11-05','2025-03-26','2025-06-18','2025-11-25'):version='2025-11-25'
            self.initialized=True
            return dict(protocolVersion=version,capabilities=dict(tools=dict(listChanged=False)),serverInfo=dict(name='codingagentlib',version='1.0.0'))
        if method in ('notifications/initialized','notifications/cancelled'):return None
        if not self.initialized:raise ValueError('Initialize this MCP session before requesting tools')
        if method=='ping':return {}
        definitions=[dict(name='project_graph',description='Query, refresh or download this project knowledge graph/ontology',inputSchema=dict(type='object',properties=dict(project=dict(type='string'),action=dict(enum=['query','refresh','export','ontology','stats','history']),query=dict(type='string',maxLength=4000),nodeIds=dict(type='array',items=dict(type='string'),maxItems=12),hops=dict(type='integer',minimum=0,maximum=4),limit=dict(type='integer',minimum=1,maximum=50),direction=dict(enum=['in','out','both']),fallback=dict(enum=['inventory','empty']),relations=dict(type='array',items=dict(type='string'),maxItems=200)),additionalProperties=False)),dict(name='python_library',description='Read project-independent Python recipes and named targets; never executes',inputSchema=dict(type='object',properties=dict(action=dict(enum=['list','read','export']),id=dict(type='string'),kind=dict(enum=['tool','target'])),additionalProperties=False)),dict(name='skills',description='List local skills and their revisions',inputSchema=dict(type='object',properties=dict(query=dict(type='string')),additionalProperties=False))]
        for tool in self.runtime.health()['tools']:
            definitions.append(dict(name=tool['name'],description=tool['description'],inputSchema=dict(type='object')))
        if method=='tools/list':return dict(tools=definitions)
        if method!='tools/call':raise LookupError('Unknown JSON-RPC method')
        name=params.get('name');arguments=params.get('arguments',{})
        if not isinstance(arguments,dict):raise ValueError('Tool arguments must be an object')
        self.calls+=1
        try:
            if name=='project_graph':
                if arguments.get('action','query') not in ('query','refresh','export','ontology','stats','history'):raise ValueError('Graph MCP interface is read-only')
                result=self.runtime.dispatch(dict(op='project_knowledge',**arguments))
            elif name=='python_library':
                if arguments.get('action','list') not in ('list','read','export'):raise ValueError('Library MCP interface is read-only')
                result=self.runtime.dispatch(dict(op='tool_library',**arguments))
            elif name=='skills':result=self.runtime.skills.list(query=arguments.get('query'))
            else:
                result=self.runtime.dispatch(dict(op='tool',session=self.session,tool=name,args=arguments,callId='rpc_'+str(self.calls)))
                if not result['ok']:raise ValueError(result['error'])
                result=result['result']
            text=json.dumps(result,ensure_ascii=False)
            return dict(content=[dict(type='text',text=text if len(text.encode())<16000 else 'Complete result is available in structuredContent.result')],structuredContent=dict(result=result),isError=False)
        except (ValueError,PermissionError,OSError,KeyError) as error:
            return dict(content=[dict(type='text',text=str(error))],isError=True)

    def frame(self,data):
        identity=data.get('id') if isinstance(data,dict) else None
        try:
            if not isinstance(data,dict) or data.get('jsonrpc')!='2.0' or not isinstance(data.get('method'),str) or not isinstance(data.get('params',{}),dict) or type(identity) not in (str,int,type(None)):raise ValueError('Invalid JSON-RPC frame')
            if isinstance(identity,str) and (not identity or len(identity)>200) or type(identity) is int and abs(identity)>9007199254740991:raise ValueError('Invalid RPC identity')
            if data['method']=='tools/call' and identity is None:raise ValueError('Tool calls require a request identity')
            if identity is not None:
                if identity in self.identities:raise ValueError('RPC request identity was already used; inspect the original outcome')
                if len(self.identities)>=2048:raise ValueError('RPC session request budget exhausted')
                self.identities.add(identity)
            result=self.request(data['method'],data.get('params',{}))
            return None if identity is None else dict(jsonrpc='2.0',id=identity,result=result)
        except LookupError as error:return dict(jsonrpc='2.0',id=identity,error=dict(code=-32601,message=str(error)))
        except (ValueError,TypeError) as error:return dict(jsonrpc='2.0',id=identity,error=dict(code=-32602,message=str(error)))


def main():
    for stream in (sys.stdin,sys.stdout):
        if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace',required=True)
    parser.add_argument('--allow-command',action='append',default=[])
    parser.add_argument('--allow-edits',action='store_true')
    parser.add_argument('--allow-commands',action='store_true')
    parser.add_argument('--tool-library')
    args=parser.parse_args()
    runtime=Runtime(args.workspace,args.allow_command,tool_library=args.tool_library)
    try:
        service=MCPService(runtime,allow_edits=args.allow_edits,allow_commands=args.allow_commands)
        while True:
            line=sys.stdin.readline(8000001)
            if not line:break
            if len(line)>8000000:
                response=dict(jsonrpc='2.0',id=None,error=dict(code=-32600,message='RPC frame exceeds 8 MB'))
                print(json.dumps(response),flush=True);break
            try:response=service.frame(json.loads(line))
            except ValueError:response=dict(jsonrpc='2.0',id=None,error=dict(code=-32700,message='Invalid JSON'))
            if response is not None:print(json.dumps(response,ensure_ascii=False),flush=True)
    finally:runtime.close()


if __name__=='__main__':main()
