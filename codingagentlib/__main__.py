"""JSON-lines local worker for JavaScript/Rust adapters. stdout contains protocol frames only."""
import argparse
import json
import signal
import sys
from .python.agent import Agent

PROTOCOL='codingagentlib/1'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace',required=True)
    parser.add_argument('--allow-command',action='append',default=[])
    parser.add_argument('--navigation-dir')
    parser.add_argument('--embedding-dir')
    args=parser.parse_args()
    with Agent(args.workspace,args.allow_command,navigation_dir=args.navigation_dir,embedding_dir=args.embedding_dir) as agent:
        def stop(*_):agent.close();raise SystemExit(0)
        signal.signal(signal.SIGTERM,stop)
        for line in sys.stdin:
            id=None
            try:
                if len(line)>16000000:raise ValueError('Worker request exceeds 16 million characters')
                data=json.loads(line)
                if not isinstance(data,dict):raise ValueError('Expected a protocol object')
                id=data.get('id')
                if type(id) not in (str,int) or data.get('protocol')!=PROTOCOL:raise ValueError('Expected codingagentlib/1 and a string/integer request ID')
                method=data.get('method');params=data.get('params',{})
                if not isinstance(params,dict):raise ValueError('Expected object params')
                if method=='dispatch':result=agent.dispatch(params)
                elif method=='agent_start':result=agent.start(**params)
                elif method=='agent_next':result=agent.next(params['session_id'])
                elif method=='agent_submit':result=agent.submit(params['session_id'],params['response'])
                elif method=='close':result={'closed':True}
                else:raise ValueError('Unknown worker method')
                response={'protocol':PROTOCOL,'id':id,'ok':True,'result':result}
            except Exception as error:response={'protocol':PROTOCOL,'id':id,'ok':False,'error':{'type':type(error).__name__,'message':str(error)}}
            print(json.dumps(response,ensure_ascii=False),flush=True)
            if response.get('ok') and data.get('method')=='close':break

if __name__=='__main__':main()
