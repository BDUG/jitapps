"""Structured & Fixed Pipelines: Agentless (Localize -> Repair -> Validate) & SDD Gate."""
from __future__ import annotations

import copy
from pathlib import Path

from .agent_runtime import Runtime
from .tree_search import cleanup_snapshots, restore_workspace, snapshot_workspace


class AgentlessPipeline:
    """Deterministic 3-phase repository repair pipeline:
    1. Localize: list workspace files + symbols, ask localizer to rank target files/symbols.
    2. Repair: generate N candidate patch sets, apply each on a clean workspace snapshot.
    3. Validate: run regression tests on each candidate, select and commit the best passing patch.
    """

    def __init__(self, workspace, commands=()):
        self.runtime = Runtime(workspace, commands)

    def close(self):
        self.runtime.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def run(
        self,
        goal,
        *,
        localizer,
        patcher,
        test_command=None,
        max_files=5,
        candidates=3,
    ):
        session = self.runtime.start({'goal': goal, 'allowEdits': True, 'allowCommands': bool(test_command)})
        sid = session['id']
        s = self.runtime.get(sid)

        # Phase 1: Hierarchical Localization
        listing = self.runtime.tool(s, 'list_files', {'limit': 200}, 'ag_list', enforce_plan=False)['result']
        files = [f['path'] for f in listing['files']]
        symbols = {}
        for path in files[:25]:
            if path.endswith(('.py', '.js', '.ts')):
                try:
                    res = self.runtime.tool(s, 'code_symbols', {'path': path, 'limit': 50}, f'ag_sym_{len(symbols)}', enforce_plan=False)
                    if res.get('ok'):
                        symbols[path] = res['result'].get('symbols', [])
                except Exception:
                    pass
        target_paths = localizer({'goal': goal, 'files': files, 'symbols': symbols})[:max_files]
        contexts = {}
        for i, path in enumerate(target_paths):
            read = self.runtime.tool(s, 'read_file', {'path': path}, f'ag_read_{i}', enforce_plan=False)
            if read.get('ok'):
                contexts[path] = read['result']

        # Phase 2 & 3: Multi-candidate Patch Generation + Regression Validation
        base_snap = snapshot_workspace(self.runtime.root)
        snapshots = [base_snap]
        patch_sets = patcher({'goal': goal, 'targets': contexts, 'maxCandidates': candidates})[:candidates]
        evaluated = []
        try:
            for idx, patch_set in enumerate(patch_sets):
                restore_workspace(self.runtime.root, base_snap)
                applied = True
                errors = []
                for e_idx, edit in enumerate(patch_set.get('edits', [])):
                    path = edit['path']
                    cur = self.runtime.tool(s, 'read_file', {'path': path}, f'ag_r_{idx}_{e_idx}', enforce_plan=False)
                    expected = cur['result']['hash'] if cur.get('ok') else 'missing'
                    if 'edits' in edit:
                        res = self.runtime.tool(s, 'apply_edits', {'path': path, 'expectedHash': expected, 'edits': edit['edits']}, f'ag_e_{idx}_{e_idx}', enforce_plan=False)
                    else:
                        res = self.runtime.tool(s, 'write_file', {'path': path, 'expectedHash': expected, 'content': edit['content']}, f'ag_w_{idx}_{e_idx}', enforce_plan=False)
                    if not res.get('ok'):
                        applied = False
                        errors.append(res.get('error', 'Edit failed'))
                        break

                test_ok = applied
                test_receipt = None
                if applied and test_command:
                    cmd_res = self.runtime.tool(s, 'run_command', test_command, f'ag_test_{idx}', enforce_plan=False)
                    test_receipt = cmd_res.get('result') or {}
                    test_ok = cmd_res.get('ok') is True and test_receipt.get('exitCode') == 0

                snap = snapshot_workspace(self.runtime.root)
                snapshots.append(snap)
                score = (1.0 if test_ok else 0.0) + (0.1 if applied else 0.0) - 0.01 * len(patch_set.get('edits', []))
                evaluated.append({'index': idx, 'applied': applied, 'passed': test_ok, 'score': score, 'errors': errors, 'test': test_receipt, 'snapshot': snap, 'summary': patch_set.get('summary', '')})

            evaluated.sort(key=lambda item: -item['score'])
            winner = evaluated[0] if evaluated else None
            if winner and winner['applied']:
                restore_workspace(self.runtime.root, winner['snapshot'])
            else:
                restore_workspace(self.runtime.root, base_snap)

            return {
                'format': 'codingagentlib/agentless-v1',
                'sessionId': sid,
                'localizedFiles': target_paths,
                'candidatesEvaluated': len(evaluated),
                'passed': bool(winner and winner['passed']),
                'selectedIndex': winner['index'] if winner else None,
                'summary': winner['summary'] if winner else 'No valid candidate patches',
            }
        finally:
            cleanup_snapshots(snapshots)
