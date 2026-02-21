/** A chunk of text stored in episodic memory. */
export interface MemoryChunk {
  id: string;
  agentId: string;
  sessionId: string;
  content: string;
  importance: number;
  tokenCount: number;
  sourceType: SourceType;
  chunkIndex: number;
  createdAt: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

/** Where a chunk originated from. */
export type SourceType = 'conversation' | 'document' | 'note' | 'daily_log';

/** Options for hybrid search. */
export interface SearchOptions {
  query: string;
  agentId: string;
  embedding?: number[];
  maxResults?: number;
  minImportance?: number;
  dateFrom?: string;
  dateTo?: string;
  sourceTypes?: SourceType[];
  sessionId?: string;
}

/** A single search result with score. */
export interface SearchResult {
  chunk: MemoryChunk;
  score: number;
  matchType: 'vector' | 'bm25' | 'hybrid';
}

/** Options for direct chunk retrieval. */
export interface GetOptions {
  agentId: string;
  id?: string;
  date?: string;
  sessionId?: string;
  limit?: number;
}

/** Embedding provider interface. */
export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  embedSingle(text: string): Promise<number[]>;
}

/** Configuration for the memory subsystem. */
export interface MemoryConfig {
  enabled: boolean;
  embedding: EmbeddingConfig;
  search: SearchConfig;
  chunking: ChunkingConfig;
  importanceScoring: ImportanceScoringConfig;
  dailyLog: DailyLogConfig;
}

export interface EmbeddingConfig {
  provider: 'auto' | 'openai' | 'none';
  dimensions: number;
  model: string;
  apiKeyEnv: string;
  batchSize: number;
}

export interface SearchConfig {
  vectorWeight: number;
  bm25Weight: number;
  decayHalfLifeDays: number;
  mmrLambda: number;
  defaultMaxResults: number;
}

export interface ChunkingConfig {
  targetTokens: number;
  overlapTokens: number;
  maxChunkTokens: number;
}

export interface ImportanceScoringConfig {
  enabled: boolean;
  defaultImportance: number;
}

export interface DailyLogConfig {
  enabled: boolean;
  directory: string;
}

/** Parameters for the hybrid search pipeline. */
export interface HybridSearchParams {
  vectorWeight: number;
  bm25Weight: number;
  decayHalfLifeDays: number;
  mmrLambda: number;
  maxResults: number;
}

/** A scored candidate from vector or BM25 search. */
export interface ScoredCandidate {
  chunk: MemoryChunk;
  score: number;
  source: 'vector' | 'bm25';
}

/** Stats about the memory store. */
export interface MemoryStats {
  chunkCount: number;
  dbSizeBytes: number;
  hasVectorSupport: boolean;
}
