const assert = require('node:assert/strict');
const { StateGraph, END, treeSearch, beyondReact } = require('./index.js');

(async () => {
  // 1. Cyclical StateGraph
  const g = new StateGraph({ maxTransitions: 10 });
  g.addNode('code', st => ({ attempt: st.attempt + 1, passed: st.attempt + 1 >= 2 }));
  g.addNode('test', () => ({ tested: true }));
  g.setEntry('code');
  g.addEdge('code', 'test');
  g.addConditionalEdges('test', st => (st.passed ? END : 'code'));
  const gRes = await g.run({ attempt: 0, passed: false });
  assert.equal(gRes.status, 'complete');
  assert.equal(gRes.state.attempt, 2);

  // 2. Tree Search (MCTS/UCB1)
  let current = 'init';
  const tsRes = await treeSearch({
    goal: 'Find good',
    snapshot: () => current,
    restore: s => { current = s; },
    propose: (st, k) => (st.depth === 0 ? ['bad', 'good'].slice(0, k) : { status: 'done' }),
    act: cand => { current = cand; return { ok: true }; },
    evaluate: () => (current === 'good' ? 1.0 : 0.0),
    maxSimulations: 3,
  });
  assert.equal(tsRes.bestReward, 1.0);
  assert.equal(current, 'good');

  // 3. CodeAct, Agentless, PlannerExecutor, MultiAgent, Reflexion
  const caRes = await beyondReact.codeActLoop({
    goal: 'sum',
    model: ({ step }) => (step === 1 ? '```js\n1+2\n```' : { done: true, code: '', summary: '3' }),
    exec: code => ({ ok: true, stdout: code }),
  });
  assert.equal(caRes.status, 'complete');

  let patched = 'old';
  const agRes = await beyondReact.agentlessPipeline({
    goal: 'fix',
    snapshot: () => patched,
    restore: s => { patched = s; },
    localize: () => ['a.js'],
    patch: () => [{ summary: 'bad', val: 'bad' }, { summary: 'good', val: 'good' }],
    applyPatch: c => { patched = c.val; return true; },
    runTests: () => patched === 'good',
  });
  assert.equal(agRes.passed, true);
  assert.equal(patched, 'good');

  const peRes = await beyondReact.plannerExecutor({
    goal: 'build',
    plan: () => [{ id: 't1', title: 'step 1' }, { id: 't2', title: 'step 2', dependsOn: ['t1'] }],
    executeTask: t => ({ status: 'complete', summary: 'done ' + t.id }),
  });
  assert.equal(peRes.status, 'complete');

  const maRes = await beyondReact.multiAgentOrchestrate({
    goal: 'ship',
    searcher: () => ['a.js'],
    coder: () => 'patch',
    tester: () => ({ passed: true }),
    reviewer: () => ({ approved: true }),
  });
  assert.equal(maRes.status, 'complete');

  const lessons = [];
  const rxRes = await beyondReact.reflexionRun({
    goal: 'recover',
    stepFn: ({ step, reflexionRequired }) => {
      if (step === 1) return { status: 'act', ok: false, error: 'boom' };
      if (reflexionRequired) return { status: 'act', ok: true, reflection: { observation: 'failed', adjustment: 'fixed' } };
      return { status: 'done', summary: 'recovered' };
    },
    onLesson: l => lessons.push(l),
  });
  assert.equal(rxRes.status, 'complete');
  assert.equal(lessons.length, 1);

  console.log('PASS JavaScript StateGraph, treeSearch, CodeAct, Agentless, PlannerExecutor, MultiAgent, and Reflexion.');
})().catch(e => { console.error(e); process.exitCode = 1; });
