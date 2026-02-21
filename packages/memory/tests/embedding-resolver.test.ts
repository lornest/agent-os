import { describe, it, expect, afterEach } from 'vitest';
import { resolveEmbeddingProvider } from '../src/embedding-resolver.js';
import { NullEmbeddingProvider } from '../src/embedding-provider.js';
import { OpenAIEmbeddingProvider } from '../src/openai-embedding-provider.js';
import type { EmbeddingConfig } from '../src/types.js';

const baseConfig: EmbeddingConfig = {
  provider: 'auto',
  dimensions: 1024,
  model: 'text-embedding-3-large',
  apiKeyEnv: 'OPENAI_API_KEY',
  batchSize: 64,
};

describe('resolveEmbeddingProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns OpenAIEmbeddingProvider when provider is "auto" and API key is set', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test-key';
    const provider = resolveEmbeddingProvider({ ...baseConfig, provider: 'auto' });
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
    expect(provider.id).toBe('openai');
  });

  it('returns NullEmbeddingProvider when provider is "auto" and API key is not set', () => {
    delete process.env['OPENAI_API_KEY'];
    const provider = resolveEmbeddingProvider({ ...baseConfig, provider: 'auto' });
    expect(provider).toBeInstanceOf(NullEmbeddingProvider);
  });

  it('returns OpenAIEmbeddingProvider when provider is "openai"', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test-key';
    const provider = resolveEmbeddingProvider({ ...baseConfig, provider: 'openai' });
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  });

  it('throws when provider is "openai" and API key is not set', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(() => resolveEmbeddingProvider({ ...baseConfig, provider: 'openai' })).toThrow(
      'Missing API key',
    );
  });

  it('returns NullEmbeddingProvider when provider is "none"', () => {
    const provider = resolveEmbeddingProvider({ ...baseConfig, provider: 'none' });
    expect(provider).toBeInstanceOf(NullEmbeddingProvider);
    expect(provider.dimensions).toBe(0);
  });
});
