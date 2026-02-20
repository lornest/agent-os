/** Score the importance of text content for memory storage. */
export interface ImportanceScorer {
  score(text: string): Promise<number>;
}

/**
 * Default importance scorer using heuristic rules.
 * A more sophisticated LLM-based scorer can replace this.
 */
export class HeuristicImportanceScorer implements ImportanceScorer {
  private readonly defaultImportance: number;

  constructor(defaultImportance = 0.5) {
    this.defaultImportance = defaultImportance;
  }

  async score(text: string): Promise<number> {
    let importance = this.defaultImportance;

    // Boost for decision-related content
    if (/\b(decided|decision|agreed|confirmed|approved)\b/i.test(text)) {
      importance += 0.15;
    }

    // Boost for action items / tasks
    if (/\b(TODO|action item|next step|will do|must|should)\b/i.test(text)) {
      importance += 0.1;
    }

    // Boost for questions and answers
    if (/\b(why|how|what|because|reason|explanation)\b/i.test(text)) {
      importance += 0.05;
    }

    // Boost for code/technical content
    if (/```|function\s|class\s|import\s|export\s/i.test(text)) {
      importance += 0.1;
    }

    // Slight penalty for very short content
    if (text.length < 50) {
      importance -= 0.1;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, importance));
  }
}
