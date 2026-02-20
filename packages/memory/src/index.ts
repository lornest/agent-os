// Types
export type {
  MemoryChunk,
  SourceType,
  SearchOptions,
  SearchResult,
  GetOptions,
  EmbeddingProvider,
  MemoryConfig,
  EmbeddingConfig,
  SearchConfig,
  ChunkingConfig,
  ImportanceScoringConfig,
  DailyLogConfig,
  HybridSearchParams,
  ScoredCandidate,
  MemoryStats,
} from './types.js';

// Errors
export { MemoryStoreError, EmbeddingError } from './errors.js';

// Config
export { DEFAULT_MEMORY_CONFIG, mergeMemoryConfig } from './config.js';

// Schema
export {
  CREATE_CHUNKS_TABLE,
  CREATE_CHUNKS_INDEXES,
  CREATE_FTS_TABLE,
  CREATE_FTS_TRIGGERS,
  CREATE_SCHEMA_META,
  ENABLE_WAL,
  SET_BUSY_TIMEOUT,
  createVecTable,
} from './schema.js';

// Chunker
export { chunkText, estimateTokens } from './chunker.js';

// Embedding providers
export { NullEmbeddingProvider } from './embedding-provider.js';
export { OpenAIEmbeddingProvider } from './openai-embedding-provider.js';

// Hybrid search
export {
  hybridRank,
  normalizeScores,
  temporalDecay,
  daysBetween,
  cosineSimilarity,
  mmrRerank,
} from './hybrid-search.js';

// Memory store
export { EpisodicMemoryStore } from './memory-store.js';

// Importance scorer
export type { ImportanceScorer } from './importance-scorer.js';
export { HeuristicImportanceScorer } from './importance-scorer.js';

// Memory tools
export {
  memorySearchTool,
  memoryGetTool,
  createMemorySearchHandler,
  createMemoryGetHandler,
} from './memory-tools.js';

// Memory flush handler
export { createMemoryFlushHandler } from './memory-flush-handler.js';
export type { MemoryFlushContext } from './memory-flush-handler.js';

// Daily log
export { readDailyLog, listDailyLogs, appendDailyLog } from './daily-log.js';
