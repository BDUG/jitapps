'use strict';

async function treeSearch({
  goal,
  propose,
  act,
  evaluate,
  snapshot,
  restore,
  branchFactor = 2,
  maxDepth = 5,
  maxSimulations = 8,
  explorationC = 1.414,
} = {}) {
  const rootSnap = await snapshot();
  const nodes = new Map();
  const root = { id: 'root', parentId: null, depth: 0, visits: 0, valueSum: 0, children: [], snapshot: rootSnap, action: null, observation: null, terminal: false, pruned: false };
  nodes.set('root', root);
  let bestNode = root;
  let bestReward = -1;

  function ucb1(node, parentVisits) {
    if (node.visits === 0) return Infinity;
    return (node.valueSum / node.visits) + explorationC * Math.sqrt(Math.log(Math.max(1, parentVisits)) / node.visits);
  }
  function backpropagate(node, reward) {
    let cur = node;
    while (cur) {
      cur.visits += 1;
      cur.valueSum += reward;
      cur = cur.parentId ? nodes.get(cur.parentId) : null;
    }
  }
  function trajectory(node) {
    const path = [];
    let cur = node;
    while (cur && cur.parentId) {
      path.push({ id: cur.id, action: cur.action, ok: cur.observation?.ok });
      cur = nodes.get(cur.parentId);
    }
    return path.reverse();
  }

  for (let sim = 0; sim < maxSimulations; sim++) {
    let cur = root;
    while (cur.children.length && !cur.terminal) {
      const active = cur.children.map(id => nodes.get(id)).filter(n => !n.pruned);
      if (!active.length) break;
      cur = active.reduce((a, b) => (ucb1(b, Math.max(1, cur.visits)) > ucb1(a, Math.max(1, cur.visits)) ? b : a));
    }
    if (cur.terminal || cur.depth >= maxDepth || cur.pruned) {
      cur.visits += 1;
      continue;
    }
    await restore(cur.snapshot);
    const candidates = await propose({ goal, depth: cur.depth, trajectory: trajectory(cur), simulation: sim }, branchFactor);
    if (candidates && !Array.isArray(candidates) && candidates.status === 'done') {
      cur.terminal = true;
      backpropagate(cur, 1.0);
      if (1.0 > bestReward) { bestReward = 1.0; bestNode = cur; }
      continue;
    }
    if (!Array.isArray(candidates) || !candidates.length) {
      cur.pruned = true;
      backpropagate(cur, 0);
      continue;
    }
    for (const cand of candidates.slice(0, branchFactor)) {
      await restore(cur.snapshot);
      const obs = await act(cand);
      const snap = await snapshot();
      const id = 'n_' + nodes.size;
      const child = { id, parentId: cur.id, depth: cur.depth + 1, visits: 0, valueSum: 0, children: [], snapshot: snap, action: cand, observation: obs, terminal: false, pruned: false };
      const reward = evaluate ? await evaluate(child) : (obs?.ok ? 0.7 : 0.1);
      nodes.set(id, child);
      cur.children.push(id);
      backpropagate(child, reward);
      if (reward > bestReward) { bestReward = reward; bestNode = child; }
    }
  }
  await restore(bestNode.snapshot);
  return { format: 'codingagentlib/tree-search-v1', nodes: nodes.size, bestNodeId: bestNode.id, bestReward, bestTrajectory: trajectory(bestNode) };
}

module.exports = { treeSearch };
