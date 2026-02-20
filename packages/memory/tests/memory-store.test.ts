import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EpisodicMemoryStore } from '../src/memory-store.js';
import { NullEmbeddingProvider } from '../src/embedding-provider.js';
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

describe('EpisodicMemoryStore', () => {
  it('opens and closes without error', () => {
    // Already opened in beforeEach
    expect(store.stats().chunkCount).toBe(0);
  });

  it('upserts and retrieves chunks', () => {
    const chunk = makeChunk({ id: 'c1', agentId: 'test-agent', content: 'Hello world' });
    store.upsertChunks([chunk]);

    const results = store.get({ agentId: 'test-agent', id: 'c1' });
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('Hello world');
    expect(results[0]!.id).toBe('c1');
  });

  it('upserts multiple chunks', () => {
    const chunks = [
      makeChunk({ id: 'c1', agentId: 'test-agent' }),
      makeChunk({ id: 'c2', agentId: 'test-agent' }),
      makeChunk({ id: 'c3', agentId: 'test-agent' }),
    ];
    store.upsertChunks(chunks);

    const stats = store.stats();
    expect(stats.chunkCount).toBe(3);
  });

  it('updates on upsert with same ID', () => {
    store.upsertChunks([makeChunk({ id: 'c1', agentId: 'test-agent', content: 'original' })]);
    store.upsertChunks([makeChunk({ id: 'c1', agentId: 'test-agent', content: 'updated' })]);

    const results = store.get({ agentId: 'test-agent', id: 'c1' });
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('updated');
  });

  it('filters by session_id', () => {
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent', sessionId: 'sess1' }),
      makeChunk({ id: 'c2', agentId: 'test-agent', sessionId: 'sess2' }),
    ]);

    const results = store.get({ agentId: 'test-agent', sessionId: 'sess1' });
    expect(results).toHaveLength(1);
    expect(results[0]!.sessionId).toBe('sess1');
  });

  it('filters by date', () => {
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent', createdAt: '2025-01-15T10:00:00Z' }),
      makeChunk({ id: 'c2', agentId: 'test-agent', createdAt: '2025-01-16T10:00:00Z' }),
    ]);

    const results = store.get({ agentId: 'test-agent', date: '2025-01-15' });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('c1');
  });

  it('updates importance', () => {
    store.upsertChunks([makeChunk({ id: 'c1', agentId: 'test-agent', importance: 0.5 })]);
    store.updateImportance(['c1'], 0.9);

    const results = store.get({ agentId: 'test-agent', id: 'c1' });
    expect(results[0]!.importance).toBeCloseTo(0.9);
  });

  it('clamps importance to [0, 1]', () => {
    store.upsertChunks([makeChunk({ id: 'c1', agentId: 'test-agent' })]);

    store.updateImportance(['c1'], 1.5);
    let results = store.get({ agentId: 'test-agent', id: 'c1' });
    expect(results[0]!.importance).toBe(1);

    store.updateImportance(['c1'], -0.5);
    results = store.get({ agentId: 'test-agent', id: 'c1' });
    expect(results[0]!.importance).toBe(0);
  });

  it('searches with BM25', () => {
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent', content: 'The quick brown fox jumps over the lazy dog' }),
      makeChunk({ id: 'c2', agentId: 'test-agent', content: 'TypeScript is a programming language' }),
      makeChunk({ id: 'c3', agentId: 'test-agent', content: 'The fox was very quick indeed' }),
    ]);

    const results = store.search({ query: 'quick fox', agentId: 'test-agent' });
    expect(results.length).toBeGreaterThan(0);
    // Results should include fox-related chunks
    const ids = results.map((r) => r.chunk.id);
    expect(ids).toContain('c1');
  });

  it('reports stats', () => {
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent' }),
      makeChunk({ id: 'c2', agentId: 'test-agent' }),
    ]);

    const stats = store.stats();
    expect(stats.chunkCount).toBe(2);
    expect(stats.dbSizeBytes).toBeGreaterThan(0);
    expect(typeof stats.hasVectorSupport).toBe('boolean');
  });

  it('throws if not opened', () => {
    const unopened = new EpisodicMemoryStore({
      agentId: 'test',
      dbPath: createTestDbPath(),
      config: testMemoryConfig(),
      embeddingProvider: new NullEmbeddingProvider(),
    });

    expect(() => unopened.get({ agentId: 'test' })).toThrow('Database not opened');
  });

  it('preserves metadata as JSON', () => {
    const chunk = makeChunk({
      id: 'c1',
      agentId: 'test-agent',
      metadata: { key: 'value', nested: { a: 1 } },
    });
    store.upsertChunks([chunk]);

    const results = store.get({ agentId: 'test-agent', id: 'c1' });
    expect(results[0]!.metadata).toEqual({ key: 'value', nested: { a: 1 } });
  });

  it('respects limit in get', () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk({ id: `c${i}`, agentId: 'test-agent' }),
    );
    store.upsertChunks(chunks);

    const results = store.get({ agentId: 'test-agent', limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('degrades gracefully without vector support', () => {
    // NullEmbeddingProvider has dimensions=0, so no vector search
    store.upsertChunks([
      makeChunk({ id: 'c1', agentId: 'test-agent', content: 'hello world' }),
    ]);

    // Search should still work via BM25
    const results = store.search({ query: 'hello', agentId: 'test-agent' });
    expect(results.length).toBeGreaterThan(0);
  });
});
