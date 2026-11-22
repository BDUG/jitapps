export type ModelCallback = (payload: unknown, signal?: AbortSignal) => Promise<string>;
export interface ProviderOptions {
  endpoint?: string;
  modelId: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}
export interface AnthropicOptions extends ProviderOptions {
  maxTokens?: number;
  anthropicVersion?: string;
}
export function openAIModel(options: ProviderOptions & { endpoint: string }): ModelCallback;
export function anthropicModel(options: AnthropicOptions): ModelCallback;
export function geminiModel(options: ProviderOptions): ModelCallback;
export function ollamaModel(options: Omit<ProviderOptions, 'apiKey'>): ModelCallback;
export function withRetry(model: ModelCallback, options?: { maxAttempts?: number; baseDelayMs?: number }): ModelCallback;
export interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface NormalizedProviderResponse {
  provider: 'openai' | 'anthropic' | 'gemini';
  text: string;
  reasoning: string;
  tool_calls: NormalizedToolCall[];
  stop_reason: string;
  raw_stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}
export type ToolModelCallback = (messages: unknown[], options?: { system?: string; toolChoice?: string; signal?: AbortSignal }) => Promise<NormalizedProviderResponse>;
export function toolSchemas(tools: Array<{ name: string; description?: string; parameters?: Record<string, unknown>; arguments?: Record<string, unknown> }>, options?: { provider?: 'openai' | 'anthropic' | 'gemini' }): unknown[];
export function parseProviderResponse(provider: 'openai' | 'anthropic' | 'gemini', result: unknown): NormalizedProviderResponse;
export function openAIToolModel(options: ProviderOptions & { endpoint: string; tools?: unknown[] }): ToolModelCallback;
export function anthropicToolModel(options: AnthropicOptions & { tools?: unknown[] }): ToolModelCallback;
export function geminiToolModel(options: ProviderOptions & { tools?: unknown[] }): ToolModelCallback;
export function toolUseToReactModel(toolModel: ToolModelCallback): ModelCallback;
