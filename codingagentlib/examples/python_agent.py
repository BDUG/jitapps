"""Deterministic local example; replace model with your own provider adapter."""
import argparse
from codingagentlib import Agent
parser=argparse.ArgumentParser();parser.add_argument('workspace');args=parser.parse_args()
def model(request):
    observed=any(e['kind']=='observation' for e in request['events'])
    return {'sessionId':request['sessionId'],'step':request['step'],'status':'done' if observed else 'act','plan':'Inspect workspace files','action':None if observed else {'tool':'list_files','args':{}},'summary':'Listed workspace files; no files changed'}
with Agent(args.workspace) as agent:print(agent.run('List this workspace',model))
