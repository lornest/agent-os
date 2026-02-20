import { describe, it, expect } from 'vitest';
import { NullEmbeddingProvider } from '../src/embedding-provider.js';

describe('NullEmbeddingProvider', () => {
  const provider = new NullEmbeddingProvider();

  it('has id "null"', () => {
    expect(provider.id).toBe('null');
  });

  it('has dimensions 0', () => {
    expect(provider.dimensions).toBe(0);
  });

  it('returns empty arrays for embed', async () => {
    const result = await provider.embed(['hello', 'world']);
    expect(result).toEqual([[], []]);
  });

  it('returns empty array for embedSingle', async () => {
    const result = await provider.embedSingle('hello');
    expect(result).toEqual([]);
  });

  it('handles empty input', async () => {
    const result = await provider.embed([]);
    expect(result).toEqual([]);
  });
});
