import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EpisodicMemoryStore } from '../src/memory-store.js';
import { NullEmbeddingProvider } from '../src/embedding-provider.js';
import {
  memorySearchTool,
  memoryGetTool,
  createMemorySearchHandler,
  createMemoryGetHandler,
} from '../src/memory-tools.js';
import { createTestDbPath, cleanupTestDb, makeChunk, testMemoryConfig } from './helpers.js';

let store: EpisodicMemoryStore;
let dbPath: string;

beforeEach(() => {
  dbPath = createTestDbPath();
  store = new EpisodicMemoryStore({
    agentId: 'test-agent',
    dbPath,
    config: testMemoryConfig(),
    embeddingProvider: new NullEmbeddingProvider(),
  });
  store.open();
});

afterEach(() => {
  store.close();
  cleanupTestDb(dbPath);
});

describe('memory tool definitions', () => {
  it('memory_search has correct structure', () => {
    expect(memorySearchTool.name).toBe('memory_search');
    expect(memorySearchTool.annotations?.readOnly).toBe(true);
    expect(memorySearchTool.annotations?.riskLevel).toBe('green');
    expect(memorySearchTool.inputSchema).toBeDefined();
  });

  it('memory_get has correct structure', () => {
    expect(memoryGetTool.name).toBe('memory_get');
    expect(memoryGetTool.annotations?.readOnly).toBe(true);
    expect(memoryGetTool.annotations?.riskLevel).toBe('green');
  });
});

describe('createMemorySearchHandler', () => {
  it('returns results for valid query', async () => {
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent', content: 'TypeScript programming language' }),
      makeChunk({ id: 'c2', agentId: 'test-agent', content: 'JavaScript runtime environment' }),
    ]);

    const handler = createMemorySearchHandler(store, 'test-agent', new NullEmbeddingProvider());
    const result = await handler({ query: 'TypeScript' });

    expect(Array.isArray(result)).toBe(true);
    const results = result as Array<{ id: string; content: string }>;
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe('c1');
  });

  it('returns error for missing query', async () => {
    const handler = createMemorySearchHandler(store, 'test-agent', new NullEmbeddingProvider());
    const result = await handler({});
    expect(result).toEqual({ error: 'Missing required parameter: query' });
  });

  it('respects max_results parameter', async () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      makeChunk({ id: `c${i}`, agentId: 'test-agent', content: `Test content number ${i}` }),
    );
    store.upsertChunks(chunks);

    const handler = createMemorySearchHandler(store, 'test-agent', new NullEmbeddingProvider());
    const result = await handler({ query: 'test content', max_results: 3 });

    const results = result as Array<{ id: string }>;
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe('createMemoryGetHandler', () => {
  it('retrieves by ID', async () => {
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent', content: 'Hello world' }),
    ]);

    const handler = createMemoryGetHandler(store, 'test-agent');
    const result = await handler({ id: 'c1' });

    const chunks = result as Array<{ id: string; content: string }>;
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('Hello world');
  });

  it('retrieves by session_id', async () => {
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent', sessionId: 'sess1' }),
      makeChunk({ id: 'c2', agentId: 'test-agent', sessionId: 'sess2' }),
    ]);

    const handler = createMemoryGetHandler(store, 'test-agent');
    const result = await handler({ session_id: 'sess1' });

    const chunks = result as Array<{ id: string; sessionId: string }>;
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.sessionId).toBe('sess1');
  });

  it('returns empty array for no matches', async () => {
    const handler = createMemoryGetHandler(store, 'test-agent');
    const result = await handler({ id: 'nonexistent' });
    expect(result).toEqual([]);
  });
});
