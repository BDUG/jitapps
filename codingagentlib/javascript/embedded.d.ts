export class EmbeddedAgent {
  constructor(options?: Record<string, unknown>);
  registerTool(name: string, spec: Record<string, unknown>, handler?: Function): this;
  unregisterTool(name: string): this;
  setContext(context: unknown): this;
  contextProvider(name: string, fn: () => unknown | Promise<unknown>): this;
  onEvent(handler: (event: Record<string, unknown>) => void): this;
  run(goal: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  resume(sessionId: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  exportSession(sessionId: string): Record<string, unknown>;
  restoreSession(snapshot: Record<string, unknown>): string;
}
