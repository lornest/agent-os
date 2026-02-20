import type {
  HybridSearchParams,
  MemoryChunk,
  ScoredCandidate,
  SearchResult,
} from './types.js';

/**
 * Merge vector and BM25 candidates using weighted score fusion,
 * apply temporal decay, then re-rank with MMR for diversity.
 */
export function hybridRank(
  vectorCandidates: ScoredCandidate[],
  bm25Candidates: ScoredCandidate[],
  params: HybridSearchParams,
  nowMs: number = Date.now(),
): SearchResult[] {
  // 1. Normalize scores within each set
  const normVector = normalizeScores(vectorCandidates);
  const normBm25 = normalizeScores(bm25Candidates);

  // 2. Merge with weighted fusion
  const merged = fusionMerge(normVector, normBm25, params.vectorWeight, params.bm25Weight);

  // 3. Apply temporal decay
  for (const entry of merged.values()) {
    const daysSince = daysBetween(new Date(entry.chunk.createdAt).getTime(), nowMs);
    entry.score *= temporalDecay(daysSince, params.decayHalfLifeDays);
  }

  // 4. Sort by score descending
  const sorted = [...merged.values()].sort((a, b) => b.score - a.score);

  // 5. MMR re-ranking for diversity
  const reranked = mmrRerank(sorted, params.mmrLambda, params.maxResults);

  return reranked;
}

/** Normalize scores to [0, 1] range using min-max normalization. */
export function normalizeScores(candidates: ScoredCandidate[]): ScoredCandidate[] {
  if (candidates.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const c of candidates) {
    if (c.score < min) min = c.score;
    if (c.score > max) max = c.score;
  }

  const range = max - min;
  if (range === 0) {
    return candidates.map((c) => ({ ...c, score: 1 }));
  }

  return candidates.map((c) => ({
    ...c,
    score: (c.score - min) / range,
  }));
}

/** Temporal decay: score *= 2^(-(days / halfLifeDays)) */
export function temporalDecay(daysSince: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 1;
  return Math.pow(2, -(daysSince / halfLifeDays));
}

/** Days between two timestamps (in ms). */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, (toMs - fromMs) / (1000 * 60 * 60 * 24));
}

/** Cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Maximal Marginal Relevance re-ranking.
 * Selects items that balance relevance with diversity.
 * lambda=1 → pure relevance, lambda=0 → pure diversity.
 */
export function mmrRerank(
  candidates: { chunk: MemoryChunk; score: number }[],
  lambda: number,
  maxResults: number,
): SearchResult[] {
  if (candidates.length === 0) return [];

  const selected: SearchResult[] = [];
  const remaining = [...candidates];

  while (selected.length < maxResults && remaining.length > 0) {
    let bestIdx = 0;
    let bestMmr = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const relevance = candidate.score;

      // Max similarity to already selected items
      let maxSim = 0;
      for (const s of selected) {
        const sim = contentSimilarity(candidate.chunk.content, s.chunk.content);
        if (sim > maxSim) maxSim = sim;
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestMmr) {
        bestMmr = mmrScore;
        bestIdx = i;
      }
    }

    const winner = remaining.splice(bestIdx, 1)[0]!;
    selected.push({
      chunk: winner.chunk,
      score: winner.score,
      matchType: 'hybrid',
    });
  }

  return selected;
}

/** Simple content similarity based on word overlap (Jaccard). */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/** Merge vector and BM25 results using weighted fusion. */
function fusionMerge(
  vectorCandidates: ScoredCandidate[],
  bm25Candidates: ScoredCandidate[],
  vectorWeight: number,
  bm25Weight: number,
): Map<string, { chunk: MemoryChunk; score: number }> {
  const merged = new Map<string, { chunk: MemoryChunk; score: number }>();

  for (const c of vectorCandidates) {
    merged.set(c.chunk.id, {
      chunk: c.chunk,
      score: vectorWeight * c.score,
    });
  }

  for (const c of bm25Candidates) {
    const existing = merged.get(c.chunk.id);
    if (existing) {
      existing.score += bm25Weight * c.score;
    } else {
      merged.set(c.chunk.id, {
        chunk: c.chunk,
        score: bm25Weight * c.score,
      });
    }
  }

  return merged;
}
