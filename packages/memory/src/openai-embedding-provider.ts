import { EmbeddingError } from './errors.js';
import type { EmbeddingConfig, EmbeddingProvider } from './types.js';

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

/** OpenAI embedding provider using fetch() (no SDK dependency). */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai';
  readonly dimensions: number;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly batchSize: number;

  constructor(config: EmbeddingConfig) {
    this.dimensions = config.dimensions;
    this.model = config.model;
    this.batchSize = config.batchSize;

    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      throw new EmbeddingError(
        `Missing API key: environment variable ${config.apiKeyEnv} is not set`,
      );
    }
    this.apiKey = apiKey;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = new Array(texts.length);

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const embeddings = await this.fetchEmbeddings(batch);

      for (let j = 0; j < embeddings.length; j++) {
        results[i + j] = embeddings[j]!;
      }
    }

    return results;
  }

  async embedSingle(text: string): Promise<number[]> {
    const results = await this.fetchEmbeddings([text]);
    return results[0]!;
  }

  private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new EmbeddingError(
        `OpenAI API error (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;
    // Sort by index to preserve order
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }
}
