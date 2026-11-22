export function codeActLoop(options?: {
  goal?: string;
  model?: (payload: { format: string; step: number; goal: string; history: unknown[] }) => unknown | Promise<unknown>;
  exec?: (code: string, step: number) => Record<string, unknown> | Promise<Record<string, unknown>>;
  maxSteps?: number;
}): Promise<{ status: 'complete' | 'paused'; steps: number; summary?: string; reason?: string; history: unknown[] }>;

export function agentlessPipeline(options?: {
  goal?: string;
  localize?: (goal: string) => unknown[] | Promise<unknown[]>;
  patch?: (input: { goal: string; targets: unknown[] }) => Array<{ summary?: string }> | Promise<Array<{ summary?: string }>>;
  applyPatch?: (candidate: unknown) => boolean | Promise<boolean>;
  runTests?: (candidate: unknown) => boolean | Promise<boolean>;
  snapshot?: () => unknown | Promise<unknown>;
  restore?: (snap: unknown) => void | Promise<void>;
  maxCandidates?: number;
}): Promise<{ format: string; localizedFiles: unknown[]; candidatesEvaluated: number; passed: boolean; selectedIndex: number | null; summary: string }>;

export function plannerExecutor(options?: {
  goal?: string;
  plan?: (goal: string) => Array<{ id: string; dependsOn?: string[] }> | Promise<Array<{ id: string; dependsOn?: string[] }>>;
  executeTask?: (task: { id: string; dependsOn?: string[] }, deps: Record<string, string>) => { status?: string; summary?: string } | Promise<{ status?: string; summary?: string }>;
}): Promise<{ status: 'complete' | 'partial'; tasks: Array<{ taskId: string; status: string; summary: string }> }>;

export function multiAgentOrchestrate(options?: {
  goal?: string;
  searcher?: (goal: string) => unknown | Promise<unknown>;
  coder?: (goal: string, search: unknown) => unknown | Promise<unknown>;
  tester?: (goal: string, code: unknown) => { passed: boolean; [key: string]: unknown } | Promise<{ passed: boolean; [key: string]: unknown }>;
  reviewer?: (input: { goal: string; code: unknown; test: unknown }) => { approved: boolean; [key: string]: unknown } | Promise<{ approved: boolean; [key: string]: unknown }>;
}): Promise<{ format: string; status: 'complete' | 'rejected'; search: unknown; code: unknown; test: unknown; review: unknown }>;

export function reflexionRun(options?: {
  goal?: string;
  stepFn?: (ctx: { step: number; reflections: unknown[]; pendingFailure: unknown }) => { passed?: boolean; done?: boolean; summary?: string; reflection?: unknown } | Promise<{ passed?: boolean; done?: boolean; summary?: string; reflection?: unknown }>;
  onLesson?: (lesson: unknown) => void | Promise<void>;
  maxSteps?: number;
}): Promise<{ status: string; steps: number; summary?: string; reflections: unknown[] }>;
