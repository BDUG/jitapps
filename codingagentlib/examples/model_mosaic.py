"""Deterministic mosaic + coding graph, with temporary source and no provider."""
from contextlib import closing
from pathlib import Path
import tempfile
from codingagentlib import Runtime,create_agent,create_model_mosaic

with tempfile.TemporaryDirectory() as folder,closing(Runtime(folder)) as runtime:
    (Path(folder)/'control.py').write_text('class FlightController: pass\n')
    runtime.knowledge.refresh(runtime,'flight')
    def reply(request):
        count=len(request['context'][0]['projectKnowledge']['nodes'])
        return dict(sessionId=request['sessionId'],step=request['step'],status='done',plan='Inspect project references',action=None,summary=f'{count} reference entities')
    model=create_model_mosaic(models=dict(planner=reply,coder=reply,reviewer=reply),routes=dict(default='coder',plan='planner',review='reviewer'),max_calls=5)
    agent=create_agent(model=model,context_providers=[runtime.knowledge.context_provider('flight',query='FlightController',hops=2)])
    print(agent.run('Inspect FlightController'))
    print(model.inspect())
