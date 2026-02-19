import type { ConversationContext } from './conversation-context.js';
import type { HookRegistry } from './hook-registry.js';
import type { LLMService } from './llm-service.js';

export interface ContextCompactorOptions {
  contextWindow: number;
  reserveTokens: number;
}

export class ContextCompactor {
  private contextWindow: number;
  private reserveTokens: number;

  constructor(options: ContextCompactorOptions) {
    this.contextWindow = options.contextWindow;
    this.reserveTokens = options.reserveTokens;
  }

  async needsCompaction(
    context: ConversationContext,
    llm: LLMService,
  ): Promise<boolean> {
    const tokens = await llm.countTokens(context.getMessages());
    return tokens >= this.contextWindow - this.reserveTokens;
  }

  async compact(
    context: ConversationContext,
    llm: LLMService,
    hooks: HookRegistry,
  ): Promise<void> {
    // Fire memory_flush hook
    await hooks.fire('memory_flush', { context });

    // Build a summary via LLM
    const history = context.getHistory();
    const summaryPrompt = [
      { role: 'system' as const, content: 'Summarize the following conversation concisely, preserving key facts and decisions.' },
      { role: 'user' as const, content: history.map((m) => `${m.role}: ${m.content}`).join('\n') },
    ];

    const response = await llm.streamCompletion(summaryPrompt, [], {});

    // Reconstruct context: system prompt + summary + last 3 exchanges
    const systemPrompt = context.getSystemPrompt();
    const lastExchanges = context.getLastExchanges(3);

    const newMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'assistant' as const, content: `[Conversation summary]\n${response.text}` },
      ...lastExchanges,
    ];

    context.replaceMessages(newMessages);

    // Fire session_compact hook
    await hooks.fire('session_compact', { context });
  }
}
