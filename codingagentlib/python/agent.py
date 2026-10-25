"""Native Python planning driver over the extracted guarded workspace runtime."""
import copy
import json
from pathlib import Path
import uuid
from .agent_runtime import Runtime
from . import agent_checks,agent_planning

SPEC=json.loads((Path(__file__).parent.parent/'protocol.json').read_text())
BROWSER_TOOLS={'read_current_project','apply_project'}

class Agent:
    def __init__(self,workspace,commands=(),**options):
        self.runtime=Runtime(workspace,commands,**options);self.pending={};self.invalid={}
    def close(self):self.runtime.close()
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
    def dispatch(self,data):return self.runtime.dispatch(data)
    def start(self,goal,allow_edits=False,allow_commands=False,acceptance_rules=None):
        return self.dispatch({'op':'start','goal':goal,'tool':'headless','allowEdits':allow_edits,'allowCommands':allow_commands,'acceptanceRules':acceptance_rules or []})
    def next(self,session_id):
        session=self.runtime.get(session_id);turn=self.dispatch({'op':'turn','session':session_id});self.pending[session_id]=turn
        tools=[t for t in self.runtime.health()['tools'] if t['name'] not in BROWSER_TOOLS and (self.runtime.shared_skills or not t['name'].startswith('catalog_'))]
        schema=copy.deepcopy(SPEC['responseSchema']);schema['properties']['sessionId']['const']=session_id;schema['properties']['step']['const']=turn['step']
        return {'protocol':SPEC['protocol'],'sessionId':session_id,'step':turn['step'],'goal':session['goal'],'workspace':str(self.runtime.root),'tools':tools,'events':copy.deepcopy(session['events']),'tasks':agent_planning.latest(session['events']),'permissions':{'allowEdits':session['allowEdits'],'allowCommands':session['allowCommands'],'applyProject':False},'responseSchema':schema,'instructions':SPEC['instructions']}
    def submit(self,session_id,raw):
        turn=self.pending.pop(session_id,None)
        if not turn:raise ValueError('No reserved turn. Request the next turn; inspect tool_status before retrying an interrupted action.')
        session=self.runtime.get(session_id);step=turn['step']
        try:
            value=json.loads(raw) if isinstance(raw,str) else copy.deepcopy(raw)
            if not isinstance(value,dict) or value.get('sessionId')!=session_id or type(value.get('step')) is not int or value['step']!=step:raise ValueError('Agent session/step identifiers do not match')
            status=value.get('status');action=value.get('action')
            if status not in {'act','ask','done'} or not isinstance(value.get('plan'),str) or not value['plan'].strip():raise ValueError('Return act/ask/done with a nonempty public plan')
            if 'reflection' in value:
                reflection=value['reflection'];known={e['value'].get('id') for e in session['events'] if e['kind']=='observation'}
                if not isinstance(reflection,dict) or any(not isinstance(reflection.get(k),str) or not reflection[k].strip() for k in ('observation','adjustment')):raise ValueError('Provide a public observation and adjustment in reflection')
                evidence=reflection.get('evidenceIds',[])
                if not isinstance(evidence,list) or any(not isinstance(id,str) or id not in known for id in evidence):raise ValueError('Reflection evidence must reference actual observed call IDs')
                value['reflection']={k:reflection[k] for k in ('observation','adjustment','evidenceIds') if k in reflection}
            if 'tasks' in value:value['tasks']=agent_planning.validate(value['tasks'])
            if status=='act':
                tools={t['name'] for t in self.runtime.health()['tools']} - BROWSER_TOOLS
                if not self.runtime.shared_skills:tools={t for t in tools if not t.startswith('catalog_')}
                if not isinstance(action,dict) or action.get('tool') not in tools or not isinstance(action.get('args'),dict):raise ValueError('Choose an available headless tool with object arguments')
                if 'checks' in action:agent_checks.validate(action['checks'])
            elif action is not None:raise ValueError('Questions and completion must have action:null')
            if status=='ask' and (not isinstance(value.get('question'),str) or not value['question'].strip()):raise ValueError('Provide a question')
            if status=='done' and (not isinstance(value.get('summary'),str) or not value['summary'].strip() or value.get('outcome','complete') not in {'complete','partial','blocked'}):raise ValueError('Provide a completion summary and valid outcome')
            if 'verification' in value and (not isinstance(value['verification'],list) or any(not isinstance(x,str) for x in value['verification'])):raise ValueError('Verification must be a string array')
            value={k:v for k,v in value.items() if k in {'sessionId','step','status','plan','action','tasks','expectation','reflection','outcome','question','summary','verification'}}
            self.dispatch({'op':'event','session':session_id,'value':value})
            if status=='ask':
                self.runtime.cancel(session);self.invalid[session_id]=0;return {'status':'waiting','question':value['question'],'sessionId':session_id}
            if status=='done':
                result=self.dispatch({'op':'finish','session':session_id,'summary':value['summary'],'outcome':value.get('outcome','complete'),'verification':value.get('verification',[]),'expectedUserRevision':turn['userRevision']})
                if result.get('steeringChanged'):return {'status':'retry','reason':'New instructions arrived'}
                self.invalid[session_id]=0;return {'status':'complete','outcome':value.get('outcome','complete'),'summary':value['summary'],'sessionId':session_id}
            observation=self.dispatch({'op':'tool','session':session_id,'tool':action['tool'],'args':action['args'],'callId':session_id+'_'+str(step),'expectedUserRevision':turn['userRevision'],**{k:action[k] for k in ('checks','taskId') if k in action}})
            self.invalid[session_id]=0;return {'status':'continue','sessionId':session_id,'observation':observation}
        except (ValueError,TypeError,KeyError) as error:
            rejected=raw if isinstance(raw,str) else json.dumps(raw)
            self.dispatch({'op':'feedback','session':session_id,'step':step,'error':str(error),'response':rejected})
            count=self.invalid.get(session_id,0)+1;self.invalid[session_id]=count
            if count>=3:self.runtime.cancel(session)
            return {'status':'waiting' if count>=3 else 'retry','error':str(error),'sessionId':session_id,'invalidPlans':count}
    def run(self,goal,model,*,session_id=None,max_steps=500,cancel_event=None,on_event=None,**permissions):
        if type(max_steps) is not int or not 1<=max_steps<=100000:raise ValueError('Use a positive max_steps budget up to 100000')
        session=self.start(goal,**permissions) if session_id is None else self.dispatch({'op':'resume','session':session_id});session_id=session['id']
        if session_id is not None:self.invalid[session_id]=0
        if goal!=session['goal']:self.dispatch({'op':'event','session':session_id,'value':{'status':'follow_up','text':goal}})
        for _ in range(max_steps):
            if cancel_event and cancel_event.is_set():self.runtime.cancel(self.runtime.get(session_id));return {'status':'paused','sessionId':session_id,'reason':'cancelled'}
            request=self.next(session_id)
            try:response=model(request)
            except BaseException:
                self.runtime.cancel(self.runtime.get(session_id));raise
            if cancel_event and cancel_event.is_set():self.runtime.cancel(self.runtime.get(session_id));return {'status':'paused','sessionId':session_id,'reason':'cancelled'}
            result=self.submit(session_id,response)
            if on_event:on_event(result)
            if result['status'] not in {'retry','continue'}:return result
        self.runtime.cancel(self.runtime.get(session_id));return {'status':'paused','reason':'step_budget','sessionId':session_id}
