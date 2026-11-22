export function treeSearch<TState = unknown>(options: {
  initialState: TState;
  expand: (state: TState) => Array<{ action?: unknown; state: TState; prior?: number }> | Promise<Array<{ action?: unknown; state: TState; prior?: number }>>;
  evaluate: (state: TState) => { score: number; terminal?: boolean; value?: unknown } | Promise<{ score: number; terminal?: boolean; value?: unknown }>;
  maxIterations?: number;
  exploration?: number;
}): Promise<{ bestState: TState; bestScore: number; iterations: number; terminal: boolean }>;
