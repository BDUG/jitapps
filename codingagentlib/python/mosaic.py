"""Optional model mosaic: host-selected roles, one model call per agent turn."""
import copy
import threading


def mosaic_phase(request):
    if request.get('step') == 1:return 'plan'
    observation=next((e.get('value',{}) for e in reversed(request.get('events',[])) if e.get('kind') in ('observation','tool_result')), {})
    return 'review' if observation.get('ok') is True and observation.get('tool') in ('run_command','run_script','script_run','read_command_output') and observation.get('result',{}).get('exitCode')==0 else 'code'



def create_model_mosaic(*,models,routes,select=mosaic_phase,max_calls=500,on_event=lambda event:None):
    if not isinstance(models,dict) or not 1<=len(models)<=16 or any(not isinstance(k,str) or not k or not callable(v) for k,v in models.items()):raise ValueError('Configure 1–16 host-owned models')
    if not isinstance(routes,dict) or 'default' not in routes or any(v not in models for v in routes.values()) or not callable(select) or not callable(on_event) or type(max_calls) is not int or max_calls<1:raise ValueError('Invalid model mosaic routes/budget')
    models,routes=dict(models),dict(routes);history=[];calls=0;lock=threading.RLock()
    def model(request):
        nonlocal calls
        with lock:
            if calls>=max_calls:raise ValueError('Mosaic model-call budget exhausted')
            role=select(copy.deepcopy(request))
            if not isinstance(role,str) or not role or len(role)>80:raise ValueError('Mosaic selector must return a bounded role name')
            identity=routes.get(role,routes['default']);calls+=1
            event=dict(call=calls,role=role,model=identity,sessionId=request.get('sessionId'),step=request.get('step'));history.append(event);del history[:-1000]
            on_event(copy.deepcopy(event))
            return models[identity](request)
    def inspect():
        with lock:return dict(format='codingagentlib/model-mosaic-v1',calls=calls,maxCalls=max_calls,routes=dict(routes),history=copy.deepcopy(history))
    model.inspect=inspect
    return model
