export const END: '__end__';

export class StateGraph {
  constructor(options?: { maxTransitions?: number });
  addNode(name: string, fn: (state: Record<string, unknown>) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>): this;
  setEntry(name: string): this;
  addEdge(src: string, dst: string): this;
  addConditionalEdges(src: string, router: (state: Record<string, unknown>) => string | Promise<string>): this;
  run(initialState?: Record<string, unknown>): Promise<{ status: 'complete' | 'paused'; steps: number; reason?: string; state: Record<string, unknown>; trace: Array<{ step: number; node: string; next: string }> }>;
}
