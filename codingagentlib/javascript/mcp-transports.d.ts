export interface McpTransport {
  notify?(method: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal }): void | Promise<void>;
  request(method: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
  close?(): Promise<void>;
}

export function frameKind(frame: unknown): 'request' | 'notification' | 'response';

export function rpcTransport(
  send: (frame: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown | Promise<unknown>
): McpTransport;

export function initialize(
  transport: McpTransport,
  options?: { signal?: AbortSignal }
): Promise<McpTransport>;

export function shellMcp(options: {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeout?: number;
  signal?: AbortSignal;
}): Promise<McpTransport & { close(): Promise<void> }>;

export function httpMcpTransport(options: {
  endpoint: string;
  headers?: Record<string, string>;
  protocolVersion?: string;
  fetch?: typeof globalThis.fetch;
}): McpTransport & {
  readonly sessionId: string | null;
  initialize(options?: { signal?: AbortSignal }): Promise<unknown>;
  close(): Promise<void>;
};
