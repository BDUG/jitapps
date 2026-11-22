"""One JSON request on stdin; one response on stdout. No network/provider calls."""
import copy
import json
import sys
from codingagentlib import EmbeddedAgent


def run(data):
    state = data['state']
    trace = []
    agent = EmbeddedAgent(context=state, on_event=trace.append)
    def color(args, _turn):
        value = args['value']
        if value not in ('red', 'blue', 'green', 'purple'):
            raise ValueError('Choose red, blue, green or purple')
        state['color'] = value
        return dict(state)
    def text(args, _turn):
        value = args['value']
        if not isinstance(value, str) or len(value) > 2000:
            raise ValueError('Text must contain at most 2000 characters')
        state['text'] = value
        return dict(state)
    agent.add_tool('svg_color', color, description='Change SVG circle color', permission='edits')
    agent.add_tool('rich_text', text, description='Replace rich text paragraph (plain text)', permission='edits')
    def model(request):
        trace.append(dict(kind='model_request', value=copy.deepcopy(request)))
        if '--model-bridge' in sys.argv:
            print(json.dumps({'modelRequest': request}), flush=True)
            response = json.loads(sys.stdin.readline())
            trace.append(dict(kind='model_response', value=copy.deepcopy(response)))
            return response
        observed = any(e['kind'] == 'observation' for e in request['events'])
        goal = request['goal']
        tool, _, value = goal.partition(' ')
        valid = tool in ('svg_color', 'rich_text') and bool(value)
        response = dict(sessionId=request['sessionId'], step=request['step'],
                        plan='Use the selected view tool and inspect its observation',
                        status='done' if observed else 'act' if valid else 'ask', action=None)
        if observed:
            response['summary'] = 'Tool finished; inspect the observation for success or failure.'
        elif valid:
            response['action'] = dict(tool=tool, args=dict(value=value))
        else:
            response['question'] = 'Try svg_color purple or rich_text Hello world'
        trace.append(dict(kind='model_response', value=copy.deepcopy(response)))
        return response
    result = agent.run(data['goal'], model, allow_edits=True, max_steps=3)
    return dict(state=state, trace=trace, result=result)

if __name__ == '__main__':
    print(json.dumps(run(json.loads(sys.stdin.readline()))))
