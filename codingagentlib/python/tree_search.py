"""Tree Search (MCTS / LATS / Critic-Guided) over workspace snapshots.

Enables branching exploration of multiple candidate actions/patches with
lightweight workspace state snapshots, UCB1 node selection, external test/critic
evaluation, backpropagation of rewards, and clean backtracking to the best
verified branch.
"""
from __future__ import annotations

import copy
import hashlib
import math
from pathlib import Path
import shutil
import tempfile
import uuid

from .agent_runtime import Runtime, SKIP


def snapshot_workspace(root):
    """Capture regular workspace files (excluding SKIP/private dirs) to a temp dir."""
    root = Path(root).resolve()
    snap_dir = Path(tempfile.mkdtemp(prefix='agent-snap-'))
    manifest = {}
    for current, dirs, files in __import__('os').walk(root, followlinks=False):
        if '__pycache__' in dirs:
            shutil.rmtree(Path(current) / '__pycache__', ignore_errors=True)
            dirs.remove('__pycache__')
        dirs[:] = sorted(d for d in dirs if d not in SKIP and not d.startswith('.env') and not (Path(current) / d).is_symlink())
        for name in sorted(files):
            p = Path(current) / name
            if p.is_symlink() or name.startswith('.env'):
                continue
            rel = str(p.relative_to(root))
            data = p.read_bytes()
            manifest[rel] = hashlib.sha256(data).hexdigest()
            dest = snap_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    return {'dir': snap_dir, 'manifest': manifest}


def restore_workspace(root, snapshot):
    """Restore workspace files to an earlier snapshot, removing newly added files."""
    root = Path(root).resolve()
    snap_dir = Path(snapshot['dir'])
    wanted = snapshot['manifest']
    for current, dirs, files in __import__('os').walk(root, followlinks=False):
        if '__pycache__' in dirs:
            shutil.rmtree(Path(current) / '__pycache__', ignore_errors=True)
            dirs.remove('__pycache__')
        dirs[:] = sorted(d for d in dirs if d not in SKIP and not d.startswith('.env') and not (Path(current) / d).is_symlink())
        for name in sorted(files):
            p = Path(current) / name
            if p.is_symlink() or name.startswith('.env'):
                continue
            rel = str(p.relative_to(root))
            if rel not in wanted:
                p.unlink(missing_ok=True)
    for rel in wanted:
        src = snap_dir / rel
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def cleanup_snapshots(snapshots):
    for snap in snapshots:
        shutil.rmtree(snap['dir'], ignore_errors=True)


class TreeNode:
    def __init__(self, node_id, *, parent_id=None, depth=0, action=None, observation=None, snapshot=None, reflection=''):
        self.id = node_id
        self.parent_id = parent_id
        self.depth = depth
        self.action = action
        self.observation = observation
        self.snapshot = snapshot
        self.reflection = reflection
        self.visits = 0
        self.value_sum = 0.0
        self.children = []
        self.terminal = False
        self.pruned = False

    @property
    def mean_value(self):
        return self.value_sum / self.visits if self.visits else 0.0

    def ucb1(self, parent_visits, c=1.414):
        if self.visits == 0:
            return float('inf')
        return self.mean_value + c * math.sqrt(math.log(max(1, parent_visits)) / self.visits)


class TreeSearchAgent:
    """MCTS / LATS / Critic-guided search over Runtime actions."""

    def __init__(self, workspace, commands=(), *, branch_factor=2, max_depth=5, exploration_c=1.414):
        self.runtime = Runtime(workspace, commands)
        self.branch_factor = branch_factor
        self.max_depth = max_depth
        self.exploration_c = exploration_c

    def close(self):
        self.runtime.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def search(
        self,
        goal,
        proposer,
        *,
        evaluator=None,
        critic=None,
        allow_edits=True,
        allow_commands=True,
        max_simulations=8,
    ):
        """Run MCTS/LATS over candidate actions, restoring the best branch at finish.

        - ``proposer(state_summary, k)`` returns up to ``k`` candidate actions
          (or ``{'status': 'done', 'summary': ...}``).
        - ``evaluator(node, runtime, session)`` returns a float reward in ``[0.0, 1.0]``.
        - ``critic(node, state_summary)`` optionally returns ``{'score': float, 'prune': bool, 'reflection': str}``.
        """
        session = self.runtime.start({'goal': goal, 'allowEdits': allow_edits, 'allowCommands': allow_commands})
        sid = session['id']
        s = self.runtime.get(sid)
        snapshots = []
        try:
            root_snap = snapshot_workspace(self.runtime.root)
            snapshots.append(root_snap)
            root = TreeNode('root', depth=0, snapshot=root_snap)
            nodes = {'root': root}
            best_node = root
            best_reward = -1.0

            for sim in range(max_simulations):
                # 1. Selection via UCB1
                cur = root
                while cur.children and not cur.terminal:
                    active = [nodes[cid] for cid in cur.children if not nodes[cid].pruned]
                    if not active:
                        break
                    cur = max(active, key=lambda n: n.ucb1(max(1, cur.visits), self.exploration_c))
                if cur.terminal or cur.depth >= self.max_depth or cur.pruned:
                    cur.visits += 1
                    continue

                # Restore workspace to selected node's state before expansion
                restore_workspace(self.runtime.root, cur.snapshot)
                summary = {
                    'goal': goal,
                    'depth': cur.depth,
                    'trajectory': self._trajectory(nodes, cur),
                    'simulation': sim,
                }
                candidates = proposer(copy.deepcopy(summary), self.branch_factor)
                if isinstance(candidates, dict) and candidates.get('status') == 'done':
                    cur.terminal = True
                    reward = 1.0
                    self._backpropagate(nodes, cur, reward)
                    if reward > best_reward:
                        best_reward, best_node = reward, cur
                    continue

                if not isinstance(candidates, list) or not candidates:
                    cur.pruned = True
                    self._backpropagate(nodes, cur, 0.0)
                    continue

                # 2. Expansion + 3. Evaluation
                for cand in candidates[:self.branch_factor]:
                    restore_workspace(self.runtime.root, cur.snapshot)
                    node_id = 'n_' + uuid.uuid4().hex[:10]
                    call_id = f'ts_{sim}_{node_id}'
                    obs = self.runtime.tool(s, cand['tool'], cand.get('args', {}), call_id, enforce_plan=False)
                    snap = snapshot_workspace(self.runtime.root)
                    snapshots.append(snap)
                    child = TreeNode(
                        node_id,
                        parent_id=cur.id,
                        depth=cur.depth + 1,
                        action=cand,
                        observation=obs,
                        snapshot=snap,
                    )
                    reward = evaluator(child, self.runtime, s) if evaluator else (0.7 if obs.get('ok') else 0.1)
                    if critic is not None:
                        crit = critic(child, summary)
                        if isinstance(crit, dict):
                            if isinstance(crit.get('score'), (int, float)):
                                reward = 0.5 * reward + 0.5 * float(crit['score'])
                            child.reflection = str(crit.get('reflection', ''))
                            if crit.get('prune'):
                                child.pruned = True
                    nodes[node_id] = child
                    cur.children.append(node_id)
                    self._backpropagate(nodes, child, reward)
                    if reward > best_reward:
                        best_reward, best_node = reward, child

            # Commit the best branch to the workspace
            restore_workspace(self.runtime.root, best_node.snapshot)
            return {
                'format': 'codingagentlib/tree-search-v1',
                'sessionId': sid,
                'simulations': max_simulations,
                'nodes': len(nodes),
                'bestNodeId': best_node.id,
                'bestReward': round(best_reward, 4),
                'bestTrajectory': self._trajectory(nodes, best_node),
            }
        finally:
            cleanup_snapshots(snapshots)

    @staticmethod
    def _trajectory(nodes, node):
        path = []
        cur = node
        while cur and cur.parent_id is not None:
            path.append({'id': cur.id, 'action': cur.action, 'ok': (cur.observation or {}).get('ok'), 'reflection': cur.reflection})
            cur = nodes.get(cur.parent_id)
        path.reverse()
        return path

    @staticmethod
    def _backpropagate(nodes, node, reward):
        cur = node
        while cur is not None:
            cur.visits += 1
            cur.value_sum += reward
            cur = nodes.get(cur.parent_id) if cur.parent_id else None
