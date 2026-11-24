export type RagProvider =
  | 'qdrant'
  | 'pinecone'
  | 'weaviate'
  | 'chroma'
  | 'milvus'
  | 'pgvector'
  | 'elasticsearch'
  | 'opensearch'
  | 'lancedb'
  | 'faiss'
  | 'custom';

export type RagSearchMode = 'hybrid' | 'dense' | 'sparse' | 'rerank';

export interface RagConfig {
  enabled?: boolean;
  provider?: RagProvider;
  endpoint?: string;
  collection?: string;
  namespace?: string;
  apiKey?: string;
  searchMode?: RagSearchMode;
  topK?: number;
  minScore?: number;
  embeddingEndpoint?: string;
  embeddingModel?: string;
  allowLocalhost?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
  ragOnly?: boolean;
}

export interface ResearchConfig {
  enabled?: boolean;
  maxToolCalls?: number;
  maxChars?: number;
  targetStack?: string;
  rag?: RagConfig;
}

export interface ResearchRequest {
  objective: string;
  target_stack?: string;
  output_format: 'api_reference' | 'bug_workaround' | 'migration_guide' | 'comparison';
  max_tool_calls?: number;
  rag?: boolean | RagConfig;
  use_rag?: boolean;
}

export interface ResearchBrief {
  status: 'complete' | 'partial_budget_exhausted' | 'no_relevant_results';
  summary: string;
  version_constraints: string[];
  code_examples: Array<{ language: string; code: string; source_url: string }>;
  gotchas: string[];
  citations: string[];
}

export class ResearchError extends Error {
  code: string;
  status: number | null;
}

export const RAG_PROVIDERS: readonly RagProvider[];
export const RAG_SEARCH_MODES: readonly RagSearchMode[];
export const DEFAULT_RESEARCH_CONFIG: ResearchConfig;

export function normalizeResearchConfig(config?: ResearchConfig | RagConfig): Required<ResearchConfig>;
export function redactResearchConfig(config?: ResearchConfig | RagConfig): Required<ResearchConfig>;
export function validatePublicUrl(url: string, options?: { allowHttp?: boolean }): Promise<string>;
export function validateRagUrl(url: string, options?: { allowLocalhost?: boolean }): Promise<string>;
export function htmlToClean(raw: string, format?: 'markdown' | 'code_only' | 'text'): string;
export function focusTruncate(text: string, focusQuery?: string | null, maxChars?: number): { text: string; truncated: boolean };
export function wrapUntrusted(url: string, content: string): string;
export function wrapUntrustedRag(provider: string, source: string, content: string): string;
export function webSearch(query: string, options?: { targetStack?: string | null; maxResults?: number; fetcher?: (url: string) => Promise<{ text: string; contentType?: string }> }): Promise<Record<string, unknown>>;
export function webFetch(url: string, options?: { focusQuery?: string | null; format?: 'markdown' | 'code_only' | 'text'; maxChars?: number; fetcher?: (url: string) => Promise<{ text: string; contentType?: string }>; allowHttp?: boolean }): Promise<Record<string, unknown>>;
export function ragSearch(query: string, options?: { config?: ResearchConfig | RagConfig | null; provider?: RagProvider | null; endpoint?: string | null; collection?: string | null; namespace?: string | null; apiKey?: string | null; topK?: number | null; minScore?: number | null; searchMode?: RagSearchMode | null; vector?: number[] | null; filter?: Record<string, unknown> | null; targetStack?: string | null; maxChars?: number | null; ragFn?: (query: string, opts: Record<string, unknown>) => Promise<Record<string, unknown>>; fetcher?: (url: string, payload: Record<string, unknown>, headers: Record<string, string>) => Promise<Record<string, unknown>> }): Promise<Record<string, unknown>>;
export function summarizeResearch(sources: Array<Record<string, unknown>>, options?: { objective?: string; targetStack?: string | null; budgetExhausted?: boolean }): ResearchBrief;
export function runResearch(request: ResearchRequest, options?: { searchFn?: typeof webSearch; fetchFn?: typeof webFetch; ragFn?: (query: string, opts: Record<string, unknown>) => Promise<Record<string, unknown>>; researchConfig?: ResearchConfig | null }): Promise<ResearchBrief>;
