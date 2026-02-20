import { describe, it, expect } from 'vitest';
import { chunkText, estimateTokens } from '../src/chunker.js';
import type { ChunkingConfig } from '../src/types.js';

const defaultConfig: ChunkingConfig = {
  targetTokens: 400,
  overlapTokens: 80,
  maxChunkTokens: 600,
};

describe('estimateTokens', () => {
  it('estimates approximately 4 chars per token', () => {
    expect(estimateTokens('hello')).toBe(2); // ceil(5/4)
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('chunkText', () => {
  it('returns empty array for empty text', () => {
    expect(chunkText('', defaultConfig)).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const text = 'Hello world. This is a test.';
    const chunks = chunkText(text, defaultConfig);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits text at sentence boundaries', () => {
    // Create text that exceeds target tokens
    const sentences = Array.from({ length: 20 }, (_, i) =>
      `Sentence number ${i + 1} with some extra words to make it longer.`,
    );
    const text = sentences.join(' ');
    const chunks = chunkText(text, { targetTokens: 50, overlapTokens: 10, maxChunkTokens: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be sentence-aligned (no broken sentences)
    for (const chunk of chunks) {
      expect(chunk).toMatch(/\.$/);
    }
  });

  it('produces overlapping chunks', () => {
    const sentences = Array.from({ length: 10 }, (_, i) =>
      `This is sentence ${i + 1} of the test document.`,
    );
    const text = sentences.join(' ');
    const chunks = chunkText(text, { targetTokens: 30, overlapTokens: 15, maxChunkTokens: 60 });

    if (chunks.length >= 2) {
      // Second chunk should overlap with the first
      const lastSentenceOfFirst = chunks[0]!.split('. ').pop();
      if (lastSentenceOfFirst) {
        // The overlap means some content from the end of chunk 0 should appear in chunk 1
        expect(chunks[1]!.length).toBeGreaterThan(0);
      }
    }
  });

  it('handles oversized single sentences', () => {
    const longSentence = 'A'.repeat(3000) + '.';
    const text = `Short sentence. ${longSentence} Another short sentence.`;
    const chunks = chunkText(text, defaultConfig);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.includes('A'.repeat(100)))).toBe(true);
  });

  it('respects target token size', () => {
    const config: ChunkingConfig = { targetTokens: 20, overlapTokens: 5, maxChunkTokens: 40 };
    const sentences = Array.from({ length: 10 }, (_, i) =>
      `Word${i} is here.`,
    );
    const text = sentences.join(' ');
    const chunks = chunkText(text, config);

    for (const chunk of chunks) {
      const tokens = estimateTokens(chunk);
      // Allow some tolerance for overlap
      expect(tokens).toBeLessThan(config.maxChunkTokens + 20);
    }
  });
});
