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
