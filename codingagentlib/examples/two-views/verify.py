"""Integration checks with a local fake provider; build Rust example first."""
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent

class Model(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        request = json.loads(payload['messages'][-1]['content'])
        step = request['step']
        action = ({'tool': 'svg_color', 'args': {'value': 'green'}} if step == 1 else
                  {'tool': 'rich_text', 'args': {'value': 'Welcome!'}}) if step < 3 else None
        reply = dict(sessionId=request['sessionId'], step=step,
                     status='act' if action else 'done', plan='Edit both views then inspect',
                     action=action, summary='Both views edited')
        body = json.dumps({'choices': [{'message': {'content': json.dumps(reply)}}]}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)

model = http.server.HTTPServer(('127.0.0.1', 0), Model)
threading.Thread(target=model.serve_forever, daemon=True).start()
checks = 0
try:
    for connected in (False, True):
        for language in ('python', 'javascript', 'rust'):
            env = {k: v for k, v in os.environ.items() if not k.startswith('TWO_VIEWS_')}
            if connected:
                env.update(TWO_VIEWS_MODEL_URL=f'http://127.0.0.1:{model.server_port}/chat',
                           TWO_VIEWS_MODEL='mock')
            host = subprocess.Popen([sys.executable, str(HERE / 'serve.py'), language, '--port', '0'],
                                    env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    text=True)
            try:
                base = host.stdout.readline().strip().split()[-1]
                page = urllib.request.urlopen(base).read().decode()
                assert ('Connected model' if connected else 'Deterministic demo') in page
                checks += 1
                goals = ['Edit both views'] if connected else [
                    'svg_color purple', 'rich_text <script>literal text</script>',
                    'svg_color orange', 'help']
                for goal in goals:
                    data = json.dumps(dict(goal=goal, state=dict(color='blue', text='Hello'))).encode()
                    req = urllib.request.Request(base + '/run', data=data,
                                                 headers={'Origin': base, 'Content-Type': 'application/json'})
                    output = json.load(urllib.request.urlopen(req))
                    if connected:
                        assert output['state'] == dict(color='green', text='Welcome!')
                        assert output['result']['metrics']['toolAttempts'] == 2
                    elif goal == 'help':
                        assert output['result']['status'] == 'waiting'
                    elif goal.endswith('orange'):
                        assert output['state']['color'] == 'blue'
                        assert output['result']['metrics']['failedTools'] == 1
                    else:
                        assert output['state']['color' if goal.startswith('svg') else 'text'] == goal.split(' ', 1)[1]
                    assert any(e['kind'] == 'model_request' for e in output['trace'])
                    assert any(e['kind'] == 'model_response' for e in output['trace'])
                    checks += 1
                try:
                    urllib.request.urlopen(urllib.request.Request(base + '/run', data=data,
                                           headers={'Origin': 'http://foreign.invalid'}))
                except urllib.error.HTTPError as error:
                    assert error.code == 403
                else:
                    raise AssertionError('Foreign origin accepted')
                checks += 1
                print(f'{language}: {"mock provider" if connected else "deterministic"} passed')
            finally:
                host.terminate()
                host.wait(timeout=5)
finally:
    model.shutdown()
print(f'{checks} integration scenarios passed')
