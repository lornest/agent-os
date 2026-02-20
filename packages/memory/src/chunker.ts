import type { ChunkingConfig } from './types.js';

/** Estimate token count from text length (approx 4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split text into sentence-aligned chunks with overlap. */
export function chunkText(
  text: string,
  config: ChunkingConfig,
): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let currentSentences: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // If a single sentence exceeds max, split it by itself
    if (sentenceTokens > config.maxChunkTokens) {
      // Flush current buffer first
      if (currentSentences.length > 0) {
        chunks.push(currentSentences.join(' '));
        currentSentences = getOverlapSentences(currentSentences, config.overlapTokens);
        currentTokens = estimateTokens(currentSentences.join(' '));
      }
      chunks.push(sentence);
      continue;
    }

    // If adding this sentence exceeds target, flush
    if (currentTokens + sentenceTokens > config.targetTokens && currentSentences.length > 0) {
      chunks.push(currentSentences.join(' '));
      currentSentences = getOverlapSentences(currentSentences, config.overlapTokens);
      currentTokens = estimateTokens(currentSentences.join(' '));
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Flush remaining
  if (currentSentences.length > 0) {
    chunks.push(currentSentences.join(' '));
  }

  return chunks;
}

/** Split text into sentences at common boundaries. */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Get the tail sentences that fit within the overlap token budget. */
function getOverlapSentences(
  sentences: string[],
  overlapTokens: number,
): string[] {
  const result: string[] = [];
  let tokens = 0;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i]!;
    const sTokens = estimateTokens(s);
    if (tokens + sTokens > overlapTokens) break;
    result.unshift(s);
    tokens += sTokens;
  }

  return result;
}
