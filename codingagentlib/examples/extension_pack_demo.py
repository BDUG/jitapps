"""Runnable opt-in host composition; no model service or Docker required.

PYTHONPATH=. python3 codingagentlib/examples/extension_pack_demo.py
This demo configures only a real git-diff check, not fictitious security gates.
"""
import json
from pathlib import Path
import subprocess
import tempfile

from codingagentlib import create_agent
from codingagentlib.extension_pack import DomainMCP, ExtensionPack, Tier


def main():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        repo = root / 'repo'; repo.mkdir()
        def git(*args):
            return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
        git('init', '-q'); git('config', 'user.name', 'Extension Demo')
        git('config', 'user.email', 'demo@example.invalid')
        (repo / 'note.txt').write_text('Host tools, durable state, explicit verification.\n')
        git('add', '.'); git('commit', '-qm', 'demo input')
        pack = ExtensionPack(repo, root / 'state', verification={'deterministic': ['git-diff-check']},
                             rules={'allowWrites': ['demo.inspect']})
        try:
            server = DomainMCP('demo', [dict(name='inspect', version=1, description='Read fixed demo note',
                permission='read', parameters={'type': 'object'},
                execute=lambda args, ctx: {'note': (repo / 'note.txt').read_text()})],
                authorize=lambda *args: True, audit=pack.audit.emit)
            pack.mcp_servers = {'demo': {'transport': server, 'trust': lambda *args: True}}
            def model(request):
                observed = any(e['kind'] == 'tool_result' and e['value']['ok'] for e in request['events'])
                return dict(sessionId=request['sessionId'], step=request['step'],
                    status='done' if observed else 'act', plan='Inspect the demo note and require current verification',
                    action=None if observed else {'tool': 'demo.inspect', 'args': {}}, summary='Read the actual demo note')
            pack.set_routing(tiers={'reasoning': Tier(model, 128)}, token_cap=100000, cost_cap_micro_usd=0)
            agent = create_agent(**pack.core_options({'model': model}))
            result = agent.run('Inspect the note', allow_commands=True)
            assert result['status'] == 'waiting'
            session = result['sessionId']
            pack.verification.run(session, 'deterministic', 'git-diff-check',
                                  lambda: {'ok': git('diff', '--check').returncode == 0})
            pack.gateway.resolve_escalation(session, 'Actual git diff check passed')
            result = agent.resume(session, allow_commands=True)
            assert result['status'] == 'complete'
            print(json.dumps(dict(result=result, checkpoints=len(pack.store.checkpoints('default', session)),
                                  auditChainValid=pack.audit.verify(), usage=pack.routing.usage(session)), indent=2))
        finally:
            pack.close()


if __name__ == '__main__':
    main()
