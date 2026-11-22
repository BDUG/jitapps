"""Real Chromium/WebDriver flow for the SDK two-view UI, inside Sandbox only.

Usage inside the packaged sandbox image: python3 /input/codingagentlib/extension_pack/browser_smoke.py
The WebDriver server and test HTTP server use container loopback; the container
has no external network. Docker is the enforced isolation boundary; Chromium
uses --no-sandbox because setuid/user-namespace sandboxes cannot start under
no-new-privileges and the default Docker seccomp profile. This flag is never
used to run a browser on the host.
"""
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[2]


def request(url, method='GET', data=None):
    payload = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(url, data=payload, method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error
    value = result.get('value')
    if isinstance(value, dict) and value.get('error'):
        raise RuntimeError(json.dumps(value))
    return value


def main():
    driver = subprocess.Popen(['chromedriver', '--port=9515', '--allowed-ips=127.0.0.1', '--verbose', '--log-path=/tmp/webdriver.log'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    host = subprocess.Popen([sys.executable, str(ROOT / 'codingagentlib/examples/two-views/serve.py'),
                             'python', '--port', '0'], stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True)
    session = None
    try:
        base = host.stdout.readline().strip().split()[-1]
        deadline = time.monotonic() + 10
        while True:
            try:
                request('http://127.0.0.1:9515/status')
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(.05)
        value = request('http://127.0.0.1:9515/session', 'POST', {'capabilities': {'alwaysMatch': {
            'browserName': 'chrome', 'goog:chromeOptions': {'args': [
                '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=/tmp/chrome-profile']}}}})
        session = 'http://127.0.0.1:9515/session/' + value['sessionId']
        def call(path, data):
            return request(session + path, 'POST', data)
        def script(source):
            return call('/execute/sync', {'script': source, 'args': []})
        def element(selector):
            return call('/element', {'using': 'css selector', 'value': selector})['element-6066-11e4-a52e-4f735466cecf']
        def wait(source):
            deadline = time.monotonic() + 10
            while not script(source):
                if time.monotonic() >= deadline:
                    raise AssertionError('UI flow timed out: ' + source)
                time.sleep(.05)
        call('/url', {'url': base})
        assert 'One agent' in script('return document.body.textContent')
        call('/element/' + element('#purple') + '/click', {})
        wait("return document.querySelector('#shape').getAttribute('fill') === 'purple'")
        goal = element('#goal')
        call('/element/' + goal + '/clear', {})
        call('/element/' + goal + '/value', {'text': 'rich_text Browser verified note'})
        call('/element/' + element('#send') + '/click', {})
        wait("return document.querySelector('#paragraph').textContent === 'Browser verified note'")
        assert 'model_request' in script("return document.querySelector('#log').textContent")
        script('const original=URL.createObjectURL; URL.createObjectURL=blob=>{window.exportBlob=blob;return original(blob)};')
        call('/element/' + element('#export') + '/click', {})
        exported = call('/execute/async', {'script': 'const done=arguments[0];window.exportBlob.text().then(text=>done(JSON.parse(text)));', 'args': []})
        assert exported['format'] == 'two-views-trace/v1'
        assert exported['state']['color'] == 'purple'
        assert exported['state']['text'] == 'Browser verified note'
        assert any(event['kind'] == 'observation' for event in exported['events'])
        print(json.dumps(dict(ok=True, checks=['navigation', 'SVG edit', 'form submission',
                                               'rich-text DOM', 'trace', 'export payload'])))
    except Exception:
        print('chromedriver exit:', driver.poll(), file=sys.stderr)
        if Path('/tmp/webdriver.log').exists():
            print(Path('/tmp/webdriver.log').read_text()[-14000:], file=sys.stderr)
        raise
    finally:
        if session:
            request(session, 'DELETE')
        for process in (host, driver):
            process.terminate()
            process.wait(timeout=5)
        host.stdout.close()


if __name__ == '__main__':
    main()
