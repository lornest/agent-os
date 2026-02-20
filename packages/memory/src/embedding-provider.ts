import type { EmbeddingProvider } from './types.js';

/** No-op embedding provider for BM25-only fallback. */
export class NullEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'null';
  readonly dimensions = 0;

  async embed(_texts: string[]): Promise<number[][]> {
    return _texts.map(() => []);
  }

  async embedSingle(_text: string): Promise<number[]> {
    return [];
  }
}
