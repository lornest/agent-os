import { describe, it, expect } from 'vitest';
import {
  normalizeScores,
  temporalDecay,
  daysBetween,
  cosineSimilarity,
  mmrRerank,
  hybridRank,
} from '../src/hybrid-search.js';
import { makeChunk } from './helpers.js';
import type { ScoredCandidate } from '../src/types.js';

describe('normalizeScores', () => {
  it('returns empty for empty input', () => {
    expect(normalizeScores([])).toEqual([]);
  });

  it('normalizes scores to [0, 1]', () => {
    const candidates: ScoredCandidate[] = [
      { chunk: makeChunk({ id: 'a' }), score: 10, source: 'bm25' },
      { chunk: makeChunk({ id: 'b' }), score: 30, source: 'bm25' },
      { chunk: makeChunk({ id: 'c' }), score: 20, source: 'bm25' },
    ];
    const result = normalizeScores(candidates);
    expect(result[0]!.score).toBeCloseTo(0);   // min
    expect(result[1]!.score).toBeCloseTo(1);   // max
    expect(result[2]!.score).toBeCloseTo(0.5); // mid
  });

  it('handles all equal scores', () => {
    const candidates: ScoredCandidate[] = [
      { chunk: makeChunk({ id: 'a' }), score: 5, source: 'bm25' },
      { chunk: makeChunk({ id: 'b' }), score: 5, source: 'bm25' },
    ];
    const result = normalizeScores(candidates);
    expect(result[0]!.score).toBe(1);
    expect(result[1]!.score).toBe(1);
  });
});

describe('temporalDecay', () => {
  it('returns 1 for day 0', () => {
    expect(temporalDecay(0, 30)).toBe(1);
  });

  it('returns 0.5 at the half-life', () => {
    expect(temporalDecay(30, 30)).toBeCloseTo(0.5);
  });

  it('returns 0.25 at double the half-life', () => {
    expect(temporalDecay(60, 30)).toBeCloseTo(0.25);
  });

  it('returns 1 when halfLifeDays is 0', () => {
    expect(temporalDecay(10, 0)).toBe(1);
  });
});

describe('daysBetween', () => {
  it('computes correct day difference', () => {
    const oneDay = 24 * 60 * 60 * 1000;
    expect(daysBetween(0, oneDay)).toBeCloseTo(1);
    expect(daysBetween(0, oneDay * 7)).toBeCloseTo(7);
  });

  it('returns 0 for same timestamps', () => {
    expect(daysBetween(1000, 1000)).toBe(0);
  });

  it('returns 0 for reversed timestamps', () => {
    expect(daysBetween(2000, 1000)).toBe(0);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('mmrRerank', () => {
  it('returns empty for empty input', () => {
    expect(mmrRerank([], 0.6, 10)).toEqual([]);
  });

  it('respects maxResults limit', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      chunk: makeChunk({ id: `c${i}`, content: `Unique content ${i}` }),
      score: 10 - i,
    }));
    const result = mmrRerank(candidates, 0.6, 3);
    expect(result).toHaveLength(3);
  });

  it('picks highest scoring first', () => {
    const candidates = [
      { chunk: makeChunk({ id: 'a', content: 'alpha' }), score: 0.9 },
      { chunk: makeChunk({ id: 'b', content: 'beta' }), score: 0.5 },
    ];
    const result = mmrRerank(candidates, 1.0, 2);
    expect(result[0]!.chunk.id).toBe('a');
  });

  it('promotes diversity with low lambda', () => {
    const similar = 'The quick brown fox jumps over the lazy dog.';
    const different = 'Quantum computing leverages superposition and entanglement.';
    const candidates = [
      { chunk: makeChunk({ id: 'a', content: similar }), score: 0.9 },
      { chunk: makeChunk({ id: 'b', content: similar + ' Again.' }), score: 0.85 },
      { chunk: makeChunk({ id: 'c', content: different }), score: 0.8 },
    ];
    // With lambda=0.1 (diversity-heavy), the different content should rank higher
    const result = mmrRerank(candidates, 0.1, 3);
    // The different content should appear before the near-duplicate
    const idxC = result.findIndex((r) => r.chunk.id === 'c');
    const idxB = result.findIndex((r) => r.chunk.id === 'b');
    expect(idxC).toBeLessThan(idxB);
  });
});

describe('hybridRank', () => {
  it('returns empty for no candidates', () => {
    const result = hybridRank([], [], {
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      decayHalfLifeDays: 30,
      mmrLambda: 0.6,
      maxResults: 10,
    });
    expect(result).toEqual([]);
  });

  it('handles BM25-only results', () => {
    const bm25: ScoredCandidate[] = [
      { chunk: makeChunk({ id: 'a' }), score: 5, source: 'bm25' },
      { chunk: makeChunk({ id: 'b' }), score: 3, source: 'bm25' },
    ];
    const result = hybridRank([], bm25, {
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      decayHalfLifeDays: 30,
      mmrLambda: 0.6,
      maxResults: 10,
    });
    expect(result.length).toBe(2);
    expect(result[0]!.matchType).toBe('hybrid');
  });

  it('merges vector and BM25 results', () => {
    const vec: ScoredCandidate[] = [
      { chunk: makeChunk({ id: 'a', content: 'alpha' }), score: 0.9, source: 'vector' },
    ];
    const bm25: ScoredCandidate[] = [
      { chunk: makeChunk({ id: 'b', content: 'beta' }), score: 5, source: 'bm25' },
    ];
    const result = hybridRank(vec, bm25, {
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      decayHalfLifeDays: 30,
      mmrLambda: 0.6,
      maxResults: 10,
    });
    expect(result.length).toBe(2);
  });

  it('applies temporal decay', () => {
    const now = Date.now();
    const recent = makeChunk({ id: 'recent', createdAt: new Date(now).toISOString() });
    const old = makeChunk({ id: 'old', createdAt: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString() });

    const bm25: ScoredCandidate[] = [
      { chunk: recent, score: 5, source: 'bm25' },
      { chunk: old, score: 5, source: 'bm25' },
    ];
    const result = hybridRank([], bm25, {
      vectorWeight: 0,
      bm25Weight: 1,
      decayHalfLifeDays: 30,
      mmrLambda: 1.0,
      maxResults: 10,
    }, now);

    // Recent should score higher
    expect(result[0]!.chunk.id).toBe('recent');
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });
});
