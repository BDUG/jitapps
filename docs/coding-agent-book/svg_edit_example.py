"""Deterministic SDK SVG round trip; run from the repo root with PYTHONPATH=.

Prints full model requests, scripted model responses and the final result as JSON.
Only a temporary workspace is modified. No provider is called.
"""
import copy
import json
from pathlib import Path
import sys
import tempfile

from codingagentlib import Agent

SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">\n  <rect id="badge" x="10" y="10" width="100" height="40" fill="#ef4444"/>\n</svg>\n'
VERIFY = "import xml.etree.ElementTree as ET; r=ET.parse('badge.svg').getroot(); n=r.find('{http://www.w3.org/2000/svg}rect'); assert r.attrib['viewBox']=='0 0 120 60'; assert n.attrib==dict(id='badge',x='10',y='10',width='100',height='40',fill='#2563eb'); print('PASS: SVG XML, blue fill, and original geometry')"


def main():
    exchanges = []

    def model(request):
        observations = [e['value'] for e in request['events'] if e['kind'] == 'observation']
        if observations and not observations[-1]['ok']:
            raise RuntimeError('Example action failed: ' + str(observations[-1]))
        count = len(observations)
        if count == 0:
            plan, action = 'Read current SVG source', dict(tool='read_file', args=dict(path='badge.svg'))
        elif count == 1:
            plan, action = 'Change only the rectangle fill', dict(tool='apply_edits', args=dict(
                path='badge.svg', expectedHash=observations[-1]['result']['hash'],
                edits=[dict(find='fill="#ef4444"', replacement='fill="#2563eb"')]))
        elif count == 2:
            plan, action = 'Check SVG XML, color and unchanged geometry', dict(
                tool='run_command', args=dict(command=sys.executable, args=['-c', VERIFY]))
        else:
            command = observations[-1]['result']
            if command.get('exitCode') != 0 or command.get('timedOut') or command.get('cancelled'):
                raise RuntimeError('SVG verification did not pass')
            plan, action = 'Report verified SVG source edit', None
        response = dict(sessionId=request['sessionId'], step=request['step'],
                        status='act' if action else 'done', plan=plan, action=action)
        if action is None:
            response.update(summary='Changed badge.svg rectangle fill from red to blue; preserved geometry.',
                            verification=['Python XML parse and exact rectangle/viewBox assertions passed. No visual rendering check.'])
        exchanges.append(dict(request=copy.deepcopy(request), response=copy.deepcopy(response)))
        return response

    with tempfile.TemporaryDirectory(prefix='svg-agent-book-') as directory:
        path = Path(directory) / 'badge.svg'
        path.write_text(SVG, encoding='utf-8')
        with Agent(directory, commands=[sys.executable]) as agent:
            result = agent.run('Change badge.svg rectangle fill from #ef4444 to #2563eb; preserve geometry and verify SVG XML.',
                               model, allow_edits=True, allow_commands=True, max_steps=4)
        assert result['status'] == 'complete', result
        assert path.read_text(encoding='utf-8') == SVG.replace('#ef4444', '#2563eb')
        print(json.dumps(dict(exchanges=exchanges, result=result, svg=path.read_text()), indent=2))


if __name__ == '__main__':
    main()
