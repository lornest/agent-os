import type { EmbeddingConfig, EmbeddingProvider } from './types.js';
import { NullEmbeddingProvider } from './embedding-provider.js';
import { OpenAIEmbeddingProvider } from './openai-embedding-provider.js';

/**
 * Resolve the appropriate EmbeddingProvider based on config.
 *
 * - `'auto'`: use OpenAI if the API key env var is set, otherwise NullEmbeddingProvider
 * - `'openai'`: use OpenAI (throws if API key is missing)
 * - `'none'`: use NullEmbeddingProvider
 */
export function resolveEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config);

    case 'auto': {
      const apiKey = process.env[config.apiKeyEnv];
      if (apiKey) {
        return new OpenAIEmbeddingProvider(config);
      }
      return new NullEmbeddingProvider();
    }

    case 'none':
    default:
      return new NullEmbeddingProvider();
  }
}
