'use strict';

function extractCode(reply) {
  if (reply && typeof reply === 'object') {
    return { code: String(reply.code || ''), done: Boolean(reply.done), summary: String(reply.summary || '') };
  }
  const text = String(reply || '').trim();
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') return { code: String(obj.code || ''), done: Boolean(obj.done), summary: String(obj.summary || '') };
    } catch {}
  }
  const m = /```(?:python|py|javascript|js)?\s*\n([\s\S]*?)\n```/.exec(text);
  if (m) return { code: m[1], done: false, summary: '' };
  return { code: text, done: false, summary: '' };
}

async function codeActLoop({ goal, model, exec, maxSteps = 20 } = {}) {
  const history = [];
  for (let step = 1; step <= maxSteps; step++) {
    const parsed = extractCode(await model({ format: 'codingagentlib/codeact-v1', step, goal, history: history.slice(-12) }));
    if (parsed.done && !parsed.code.trim()) return { status: 'complete', steps: step, summary: parsed.summary, history };
    const obs = await exec(parsed.code, step);
    history.push({ step, code: parsed.code, ...obs });
    if (parsed.done) return { status: 'complete', steps: step, summary: parsed.summary, history };
  }
  return { status: 'paused', reason: 'step_budget', steps: maxSteps, history };
}

async function agentlessPipeline({ goal, localize, patch, applyPatch, runTests, snapshot, restore, maxCandidates = 3 } = {}) {
  const targets = await localize(goal);
  const base = await snapshot();
  const candidates = (await patch({ goal, targets })).slice(0, maxCandidates);
  const evaluated = [];
  for (let i = 0; i < candidates.length; i++) {
    await restore(base);
    const applied = await applyPatch(candidates[i]);
    const passed = applied ? await runTests(candidates[i]) : false;
    const snap = await snapshot();
    const score = (passed ? 1.0 : 0.0) + (applied ? 0.1 : 0.0);
    evaluated.push({ index: i, applied, passed, score, snap, summary: candidates[i].summary || '' });
  }
  evaluated.sort((a, b) => b.score - a.score);
  const winner = evaluated[0];
  await restore(winner && winner.applied ? winner.snap : base);
  return { format: 'codingagentlib/agentless-v1', localizedFiles: targets, candidatesEvaluated: evaluated.length, passed: Boolean(winner?.passed), selectedIndex: winner?.index ?? null, summary: winner?.summary || '' };
}

async function plannerExecutor({ goal, plan, executeTask } = {}) {
  const tasks = await plan(goal);
  const completed = new Map();
  const ordered = [];
  while (completed.size < tasks.length) {
    const ready = tasks.filter(t => !completed.has(t.id) && (t.dependsOn || []).every(d => completed.has(d)));
    if (!ready.length) throw Error('Task DAG has unresolvable dependencies');
    for (const task of ready) {
      const deps = Object.fromEntries((task.dependsOn || []).map(d => [d, completed.get(d).summary]));
      const res = await executeTask(task, deps);
      const entry = { taskId: task.id, status: res.status || 'complete', summary: res.summary || '' };
      completed.set(task.id, entry);
      ordered.push(entry);
      if (entry.status !== 'complete') return { status: 'partial', tasks: ordered };
    }
  }
  return { status: 'complete', tasks: ordered };
}

async function multiAgentOrchestrate({ goal, searcher, coder, tester, reviewer } = {}) {
  const search = await searcher(goal);
  const code = await coder(goal, search);
  const test = await tester(goal, code);
  const review = reviewer ? await reviewer({ goal, code, test }) : { approved: true };
  return { format: 'codingagentlib/multi-agent-v1', status: test.passed && review.approved ? 'complete' : 'rejected', search, code, test, review };
}

async function reflexionRun({ goal, stepFn, onLesson, maxSteps = 20 } = {}) {
  const reflections = [];
  let pendingFailure = null;
  for (let step = 1; step <= maxSteps; step++) {
    const reply = await stepFn({ step, goal, reflexionRequired: pendingFailure });
    if (pendingFailure && reply.status === 'act') {
      if (!reply.reflection?.observation || !reply.reflection?.adjustment) throw Error('Reflexion requires observation and adjustment after a failure');
      reflections.push(reply.reflection);
      if (onLesson) await onLesson({ failure: pendingFailure, reflection: reply.reflection });
    }
    if (reply.status === 'done') return { status: 'complete', steps: step, summary: reply.summary || '', reflections };
    pendingFailure = reply.ok === false ? { step, error: reply.error || 'failed' } : null;
  }
  return { status: 'paused', reason: 'step_budget', steps: maxSteps, reflections };
}

module.exports = { extractCode, codeActLoop, agentlessPipeline, plannerExecutor, multiAgentOrchestrate, reflexionRun };
