'use strict';
const END = '__end__';

class StateGraph {
  constructor({ maxTransitions = 50 } = {}) {
    this.nodes = new Map();
    this.edges = new Map();
    this.conditional = new Map();
    this.entry = null;
    this.maxTransitions = maxTransitions;
  }
  addNode(name, fn) {
    if (!name || name === END || typeof fn !== 'function') throw Error('Invalid state node');
    this.nodes.set(name, fn);
    return this;
  }
  setEntry(name) {
    if (!this.nodes.has(name)) throw Error('Unknown entry node: ' + name);
    this.entry = name;
    return this;
  }
  addEdge(src, dst) {
    if (!this.nodes.has(src) || (dst !== END && !this.nodes.has(dst))) throw Error('Invalid edge');
    this.edges.set(src, dst);
    return this;
  }
  addConditionalEdges(src, router) {
    if (!this.nodes.has(src) || typeof router !== 'function') throw Error('Invalid conditional edge');
    this.conditional.set(src, router);
    return this;
  }
  async run(initialState = {}, { onTransition } = {}) {
    if (!this.entry) throw Error('Call setEntry() before run()');
    let state = structuredClone(initialState);
    let current = this.entry;
    const trace = [];
    for (let step = 1; step <= this.maxTransitions; step++) {
      if (current === END) return { status: 'complete', steps: step - 1, state, trace };
      const fn = this.nodes.get(current);
      if (!fn) throw Error('Unknown state node: ' + current);
      const patch = await fn(structuredClone(state));
      if (patch && typeof patch === 'object') state = { ...state, ...patch };
      const next = this.conditional.has(current)
        ? await this.conditional.get(current)(structuredClone(state))
        : (this.edges.get(current) ?? END);
      trace.push({ step, node: current, next });
      if (onTransition) onTransition(trace[trace.length - 1], structuredClone(state));
      current = next;
    }
    return { status: 'paused', reason: 'max_transitions', steps: this.maxTransitions, state, trace };
  }
}

module.exports = { StateGraph, END };
