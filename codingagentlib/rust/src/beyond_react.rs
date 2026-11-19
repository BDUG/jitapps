//! Beyond-ReAct agent architectures: cyclical StateGraph, MCTS/UCB1 tree_search,
//! Agentless 3-phase pipeline, Multi-Agent orchestration, and enforced Reflexion.
use serde_json::{json, Value};
use std::collections::HashMap;

pub const END: &str = "__end__";

pub type NodeFn = Box<dyn FnMut(&Value) -> Value>;
pub type RouterFn = Box<dyn FnMut(&Value) -> String>;

pub struct StateGraph {
    nodes: HashMap<String, NodeFn>,
    edges: HashMap<String, String>,
    conditional: HashMap<String, RouterFn>,
    entry: Option<String>,
    max_transitions: usize,
}

impl StateGraph {
    pub fn new(max_transitions: usize) -> Self {
        Self {
            nodes: HashMap::new(),
            edges: HashMap::new(),
            conditional: HashMap::new(),
            entry: None,
            max_transitions,
        }
    }

    pub fn add_node(&mut self, name: &str, f: impl FnMut(&Value) -> Value + 'static) -> &mut Self {
        self.nodes.insert(name.to_string(), Box::new(f));
        self
    }

    pub fn set_entry(&mut self, name: &str) -> &mut Self {
        self.entry = Some(name.to_string());
        self
    }

    pub fn add_edge(&mut self, src: &str, dst: &str) -> &mut Self {
        self.edges.insert(src.to_string(), dst.to_string());
        self
    }

    pub fn add_conditional_edges(&mut self, src: &str, router: impl FnMut(&Value) -> String + 'static) -> &mut Self {
        self.conditional.insert(src.to_string(), Box::new(router));
        self
    }

    pub fn run(&mut self, initial: Value) -> Result<Value, String> {
        let mut current = self.entry.clone().ok_or("Call set_entry() before run()")?;
        let mut state = initial;
        let mut trace = Vec::new();
        for step in 1..=self.max_transitions {
            if current == END {
                return Ok(json!({ "status": "complete", "steps": step - 1, "state": state, "trace": trace }));
            }
            let node = self.nodes.get_mut(&current).ok_or_else(|| format!("Unknown node: {current}"))?;
            let patch = node(&state);
            if let (Some(dst), Some(src)) = (state.as_object_mut(), patch.as_object()) {
                for (k, v) in src {
                    dst.insert(k.clone(), v.clone());
                }
            }
            let next = if let Some(router) = self.conditional.get_mut(&current) {
                router(&state)
            } else {
                self.edges.get(&current).cloned().unwrap_or_else(|| END.to_string())
            };
            trace.push(json!({ "step": step, "node": current, "next": next }));
            current = next;
        }
        Ok(json!({ "status": "paused", "reason": "max_transitions", "steps": self.max_transitions, "state": state, "trace": trace }))
    }
}

#[derive(Clone)]
struct TsNode<S> {
    id: String,
    parent: Option<usize>,
    depth: usize,
    visits: usize,
    value_sum: f64,
    children: Vec<usize>,
    snapshot: S,
    action: Value,
    terminal: bool,
    pruned: bool,
}

fn ucb1<S>(n: &TsNode<S>, parent_visits: usize, c: f64) -> f64 {
    if n.visits == 0 {
        f64::INFINITY
    } else {
        (n.value_sum / n.visits as f64) + c * (((parent_visits.max(1) as f64).ln()) / n.visits as f64).sqrt()
    }
}

pub fn tree_search<S: Clone>(
    goal: &str,
    branch_factor: usize,
    max_depth: usize,
    max_simulations: usize,
    mut snapshot: impl FnMut() -> S,
    mut restore: impl FnMut(&S),
    mut propose: impl FnMut(&str, usize) -> Option<Vec<Value>>,
    mut act: impl FnMut(&Value) -> Value,
    mut evaluate: impl FnMut(&Value) -> f64,
) -> Value {
    let root_snap = snapshot();
    let mut nodes = vec![TsNode {
        id: "root".to_string(),
        parent: None,
        depth: 0,
        visits: 0,
        value_sum: 0.0,
        children: Vec::new(),
        snapshot: root_snap,
        action: Value::Null,
        terminal: false,
        pruned: false,
    }];
    let mut best_idx = 0usize;
    let mut best_reward = -1.0f64;

    for _ in 0..max_simulations {
        let mut cur = 0usize;
        while !nodes[cur].children.is_empty() && !nodes[cur].terminal {
            let p_visits = nodes[cur].visits.max(1);
            let next = nodes[cur]
                .children
                .iter()
                .copied()
                .filter(|&i| !nodes[i].pruned)
                .max_by(|&a, &b| ucb1(&nodes[a], p_visits, 1.414).partial_cmp(&ucb1(&nodes[b], p_visits, 1.414)).unwrap_or(std::cmp::Ordering::Equal));
            match next {
                Some(i) => cur = i,
                None => break,
            }
        }
        if nodes[cur].terminal || nodes[cur].depth >= max_depth || nodes[cur].pruned {
            nodes[cur].visits += 1;
            continue;
        }
        let snap = nodes[cur].snapshot.clone();
        restore(&snap);
        let cands = match propose(goal, nodes[cur].depth) {
            None => {
                nodes[cur].terminal = true;
                let mut idx = Some(cur);
                while let Some(i) = idx {
                    nodes[i].visits += 1;
                    nodes[i].value_sum += 1.0;
                    idx = nodes[i].parent;
                }
                if 1.0 > best_reward {
                    best_reward = 1.0;
                    best_idx = cur;
                }
                continue;
            }
            Some(list) if list.is_empty() => {
                nodes[cur].pruned = true;
                continue;
            }
            Some(list) => list,
        };
        for cand in cands.into_iter().take(branch_factor) {
            restore(&snap);
            let obs = act(&cand);
            let reward = evaluate(&obs);
            let child_snap = snapshot();
            let child_idx = nodes.len();
            nodes.push(TsNode {
                id: format!("n_{child_idx}"),
                parent: Some(cur),
                depth: nodes[cur].depth + 1,
                visits: 0,
                value_sum: 0.0,
                children: Vec::new(),
                snapshot: child_snap,
                action: cand,
                terminal: false,
                pruned: false,
            });
            nodes[cur].children.push(child_idx);
            let mut bp = Some(child_idx);
            while let Some(i) = bp {
                nodes[i].visits += 1;
                nodes[i].value_sum += reward;
                bp = nodes[i].parent;
            }
            if reward > best_reward {
                best_reward = reward;
                best_idx = child_idx;
            }
        }
    }
    restore(&nodes[best_idx].snapshot);
    json!({
        "format": "codingagentlib/tree-search-v1",
        "nodes": nodes.len(),
        "bestNodeId": nodes[best_idx].id,
        "bestReward": best_reward,
    })
}

pub fn agentless_pipeline<S: Clone>(
    goal: &str,
    mut snapshot: impl FnMut() -> S,
    mut restore: impl FnMut(&S),
    mut localize: impl FnMut(&str) -> Vec<String>,
    mut patch: impl FnMut(&str, &[String]) -> Vec<Value>,
    mut apply_and_test: impl FnMut(&Value) -> bool,
) -> Value {
    let targets = localize(goal);
    let base = snapshot();
    let candidates = patch(goal, &targets);
    let mut best: Option<(usize, S)> = None;
    for (i, cand) in candidates.iter().enumerate() {
        restore(&base);
        if apply_and_test(cand) {
            best = Some((i, snapshot()));
            break;
        }
    }
    if let Some((idx, win)) = best {
        restore(&win);
        json!({ "format": "codingagentlib/agentless-v1", "localizedFiles": targets, "passed": true, "selectedIndex": idx })
    } else {
        restore(&base);
        json!({ "format": "codingagentlib/agentless-v1", "localizedFiles": targets, "passed": false, "selectedIndex": Value::Null })
    }
}

pub fn reflexion_run(
    goal: &str,
    max_steps: usize,
    mut step_fn: impl FnMut(usize, &str, Option<&Value>) -> Value,
    mut on_lesson: impl FnMut(&Value),
) -> Result<Value, String> {
    let mut reflections = Vec::new();
    let mut pending_failure: Option<Value> = None;
    for step in 1..=max_steps {
        let reply = step_fn(step, goal, pending_failure.as_ref());
        if let Some(ref fail) = pending_failure {
            if reply["status"] == "act" {
                let refl = &reply["reflection"];
                if refl["observation"].as_str().unwrap_or("").is_empty() || refl["adjustment"].as_str().unwrap_or("").is_empty() {
                    return Err("Reflexion requires observation and adjustment after a failure".into());
                }
                let lesson = json!({ "failure": fail, "reflection": refl });
                on_lesson(&lesson);
                reflections.push(refl.clone());
            }
        }
        if reply["status"] == "done" {
            return Ok(json!({ "status": "complete", "steps": step, "summary": reply["summary"], "reflections": reflections }));
        }
        pending_failure = if reply["ok"].as_bool() == Some(false) {
            Some(json!({ "step": step, "error": reply["error"] }))
        } else {
            None
        };
    }
    Ok(json!({ "status": "paused", "reason": "step_budget", "steps": max_steps, "reflections": reflections }))
}

pub fn multi_agent_orchestrate(
    goal: &str,
    mut searcher: impl FnMut(&str) -> Value,
    mut coder: impl FnMut(&str, &Value) -> Value,
    mut tester: impl FnMut(&str, &Value) -> Value,
    mut reviewer: impl FnMut(&str, &Value, &Value) -> Value,
) -> Value {
    let search = searcher(goal);
    let code = coder(goal, &search);
    let test = tester(goal, &code);
    let review = reviewer(goal, &code, &test);
    let ok = test["passed"].as_bool() == Some(true) && review["approved"].as_bool() == Some(true);
    json!({
        "format": "codingagentlib/multi-agent-v1",
        "status": if ok { "complete" } else { "rejected" },
        "search": search,
        "code": code,
        "test": test,
        "review": review,
    })
}
