export class TraceContext {
  traceId: string;
  spanId: string;
  flags: string;
  constructor(options?: { traceId?: string | null; spanId?: string | null; flags?: string });
  traceparent(): string;
  static parse(header: string): TraceContext;
}

export class GenAISpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  kind: number;
  attributes: Record<string, unknown>;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setError(message: string, errorType?: string): void;
  end(): void;
  toOtlp(): Record<string, unknown>;
}

export class GenAITracer {
  serviceName: string;
  serviceVersion: string;
  context: TraceContext;
  spans: GenAISpan[];
  constructor(options?: { serviceName?: string; serviceVersion?: string; traceContext?: TraceContext | null });
  startSpan(name: string, options?: { parent?: GenAISpan | string | null; kind?: number; attributes?: Record<string, unknown> }): GenAISpan;
  startAgentSpan(agentName?: string, options?: { conversationId?: string | null }): GenAISpan;
  startChatSpan(options?: { system?: string; model?: string; parent?: GenAISpan | string | null }): GenAISpan;
  startToolSpan(toolName: string, options?: { callId?: string | null; parent?: GenAISpan | string | null }): GenAISpan;
  exportOtlpJson(): Record<string, unknown>;
}

export class ReactOtelObserver {
  tracer: GenAITracer;
  rootSpan: GenAISpan | null;
  constructor(tracer?: GenAITracer | null, options?: { agentName?: string; modelName?: string; system?: string });
  onEvent(event: Record<string, unknown>): void;
}
