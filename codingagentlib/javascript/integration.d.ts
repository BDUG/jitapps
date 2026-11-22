export class ContextRegistry {
  constructor(options?: Record<string, unknown>);
  register(name: string, source: (() => unknown | Promise<unknown>) | Record<string, unknown>): this;
  unregister(name: string): this;
  snapshot(): Promise<{ revision: number; sources: Record<string, unknown> }>;
}
