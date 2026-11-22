export function formatSse(event: string | null, data: unknown, options?: { eventId?: string | number | null }): string;

export function agUiEvents(
  event: Record<string, unknown>,
  options?: { runId?: string; threadId?: string; messageId?: string | null }
): Array<Record<string, unknown>>;

export class SSEStreamBridge {
  fmt: 'ag-ui' | 'sse';
  runId: string;
  threadId: string;
  frames: string[];
  constructor(options?: { fmt?: 'ag-ui' | 'sse'; runId?: string; threadId?: string; writer?: ((frame: string) => void) | null });
  emit(event: Record<string, unknown>): void;
}

export class ACPServer {
  static PROTOCOL_VERSION: number;
  notifications: Array<Record<string, unknown>>;
  constructor(options?: {
    agentName?: string;
    agentVersion?: string;
    promptHandler?: ((sessionId: string, params: Record<string, unknown>, server: ACPServer) => Record<string, unknown> | Promise<Record<string, unknown>>) | null;
    emitNotification?: ((note: Record<string, unknown>) => void) | null;
  });
  emitUpdate(sessionId: string, update: Record<string, unknown>): Record<string, unknown>;
  requestPermission(
    sessionId: string,
    options: { toolCallId: string; title: string; kind?: string; options?: Array<Record<string, unknown>> | null }
  ): Record<string, unknown>;
  handle(frame: Record<string, unknown>): Promise<Record<string, unknown>>;
}
