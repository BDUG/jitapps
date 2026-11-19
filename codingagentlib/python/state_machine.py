"""Cyclical State Machine DSL (StateGraph) & Planner-Executor isolation."""
from __future__ import annotations

import copy

from .agent_planning import validate as validate_tasks
from .react import ReactAgent

END = '__end__'


class StateGraph:
    """Explicit cyclical state machine with conditional routing and bounded steps."""

    def __init__(self, *, max_transitions=50):
        self.nodes = {}
        self.edges = {}
        self.conditional = {}
        self.entry = None
        self.max_transitions = max_transitions

    def add_node(self, name, fn):
        if not name or name == END or not callable(fn):
            raise ValueError('Provide a valid node name and callable')
        self.nodes[name] = fn
        return self

    def set_entry(self, name):
        if name not in self.nodes:
            raise ValueError('Entry node must be registered first: ' + name)
        self.entry = name
        return self

    def add_edge(self, src, dst):
        if src not in self.nodes or (dst != END and dst not in self.nodes):
            raise ValueError(f'Invalid edge {src} -> {dst}')
        self.edges[src] = dst
        return self

    def add_conditional_edges(self, src, router):
        if src not in self.nodes or not callable(router):
            raise ValueError('Invalid conditional edge for ' + src)
        self.conditional[src] = router
        return self

    def run(self, initial_state, *, on_transition=None):
        if not self.entry:
            raise ValueError('Call set_entry() before run()')
        state = copy.deepcopy(initial_state)
        current = self.entry
        trace = []
        for step in range(1, self.max_transitions + 1):
            if current == END:
                return {'status': 'complete', 'steps': step - 1, 'state': state, 'trace': trace}
            if current not in self.nodes:
                raise ValueError('Unknown state node: ' + current)
            patch = self.nodes[current](copy.deepcopy(state))
            if isinstance(patch, dict):
                state.update(patch)
            if current in self.conditional:
                nxt = self.conditional[current](copy.deepcopy(state))
            else:
                nxt = self.edges.get(current, END)
            trace.append({'step': step, 'node': current, 'next': nxt})
            if on_transition:
                on_transition(trace[-1], copy.deepcopy(state))
            current = nxt
        return {'status': 'paused', 'reason': 'max_transitions', 'steps': self.max_transitions, 'state': state, 'trace': trace}


class PlannerExecutorAgent:
    """Decouples a frontier planner from isolated per-task executor runs."""

    def __init__(self, workspace, commands=(), *, planner_model, executor_model):
        self.workspace = workspace
        self.commands = commands
        self.planner_model = planner_model
        self.executor_model = executor_model

    def run(self, goal, *, allow_edits=True, allow_commands=True, max_task_steps=20):
        plan_raw = self.planner_model({'format': 'codingagentlib/planner-v1', 'goal': goal, 'instructions': 'Return {"tasks":[{"id":"t1","title":"...","status":"pending","dependsOn":[]}]}'})
        tasks = validate_tasks(plan_raw['tasks'] if isinstance(plan_raw, dict) else plan_raw)
        completed = {}
        ordered = []

        while len(completed) < len(tasks):
            ready = [t for t in tasks if t['id'] not in completed and all(dep in completed for dep in t.get('dependsOn', []))]
            if not ready:
                raise ValueError('Task DAG has unresolvable dependencies')
            for task in ready:
                dep_summaries = {d: completed[d]['summary'] for d in task.get('dependsOn', [])}
                task_goal = f"{goal}\n\nAssigned subtask [{task['id']}]: {task['title']}\nCompleted dependency context: {dep_summaries}"
                # Each subtask executes in an isolated ReactAgent session with its own fresh context
                with ReactAgent(self.workspace, self.commands) as executor:
                    res = executor.run(
                        task_goal,
                        self.executor_model,
                        allow_edits=allow_edits,
                        allow_commands=allow_commands,
                        max_steps=max_task_steps,
                    )
                completed[task['id']] = {'taskId': task['id'], 'title': task['title'], 'status': res['status'], 'summary': res.get('summary', '')}
                ordered.append(completed[task['id']])
                if res['status'] != 'complete':
                    return {'status': 'partial', 'tasks': ordered}

        return {'status': 'complete', 'tasks': ordered}
