import { describe, it, expect } from 'vitest';
import { HeuristicImportanceScorer } from '../src/importance-scorer.js';

describe('HeuristicImportanceScorer', () => {
  const scorer = new HeuristicImportanceScorer(0.5);

  it('returns default importance for neutral text', async () => {
    const score = await scorer.score('This is a normal conversation message with enough length to avoid penalty.');
    expect(score).toBeCloseTo(0.5, 1);
  });

  it('boosts decision-related content', async () => {
    const score = await scorer.score('We decided to use SQLite for the memory store because of its simplicity.');
    expect(score).toBeGreaterThan(0.5);
  });

  it('boosts action items', async () => {
    const score = await scorer.score('TODO: implement the chunker module next week with proper sentence boundary detection.');
    expect(score).toBeGreaterThan(0.5);
  });

  it('boosts code content', async () => {
    const score = await scorer.score('```typescript\nfunction hello() { return "world"; }\n```');
    expect(score).toBeGreaterThan(0.5);
  });

  it('penalizes very short content', async () => {
    const score = await scorer.score('OK');
    expect(score).toBeLessThan(0.5);
  });

  it('clamps to [0, 1]', async () => {
    // Even with multiple boosts, score should not exceed 1
    const score = await scorer.score(
      'We decided the TODO action item: next step is to export function from class because of the reason why.',
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('uses custom default importance', async () => {
    const custom = new HeuristicImportanceScorer(0.7);
    const score = await custom.score('A normal message that is long enough to not get penalized at all.');
    expect(score).toBeCloseTo(0.7, 1);
  });
});
