import type { MemoryConfig } from './types.js';

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  embedding: {
    provider: 'auto',
    dimensions: 1024,
    model: 'text-embedding-3-large',
    apiKeyEnv: 'OPENAI_API_KEY',
    batchSize: 64,
  },
  search: {
    vectorWeight: 0.7,
    bm25Weight: 0.3,
    decayHalfLifeDays: 30,
    mmrLambda: 0.6,
    defaultMaxResults: 10,
  },
  chunking: {
    targetTokens: 400,
    overlapTokens: 80,
    maxChunkTokens: 600,
  },
  importanceScoring: {
    enabled: true,
    defaultImportance: 0.5,
  },
  dailyLog: {
    enabled: true,
    directory: 'memory',
  },
};

/** Deep-merge a partial memory config with defaults. */
export function mergeMemoryConfig(
  partial?: Partial<MemoryConfig>,
): MemoryConfig {
  if (!partial) return { ...DEFAULT_MEMORY_CONFIG };

  return {
    enabled: partial.enabled ?? DEFAULT_MEMORY_CONFIG.enabled,
    embedding: {
      ...DEFAULT_MEMORY_CONFIG.embedding,
      ...partial.embedding,
    },
    search: {
      ...DEFAULT_MEMORY_CONFIG.search,
      ...partial.search,
    },
    chunking: {
      ...DEFAULT_MEMORY_CONFIG.chunking,
      ...partial.chunking,
    },
    importanceScoring: {
      ...DEFAULT_MEMORY_CONFIG.importanceScoring,
      ...partial.importanceScoring,
    },
    dailyLog: {
      ...DEFAULT_MEMORY_CONFIG.dailyLog,
      ...partial.dailyLog,
    },
  };
}
