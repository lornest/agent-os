import type {
  CompletionOptions,
  LLMProvider,
  Message,
  StreamChunk,
  StreamResponse,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from '@agentic-os/core';
import type { LLMServiceOptions, ActiveBinding } from './types.js';
import { LLMProviderUnavailableError } from './errors.js';

export class LLMService {
  private providers: LLMProvider[];
  private binding: ActiveBinding | null = null;
  private sessionTokenUsage: TokenUsage = { input: 0, output: 0, total: 0 };

  constructor(options: LLMServiceOptions) {
    this.providers = options.providers;
  }

  bindSession(sessionId: string): void {
    for (const provider of this.providers) {
      this.binding = {
        providerId: provider.id,
        profileId: provider.id,
        sessionId,
      };
      return;
    }
    throw new LLMProviderUnavailableError();
  }

  unbindSession(): void {
    this.binding = null;
  }

  async streamCompletion(
    messages: Message[],
    tools: ToolDefinition[],
    options: CompletionOptions = {},
  ): Promise<StreamResponse> {
    const provider = this.getActiveProvider();
    let text = '';
    const toolCallMap = new Map<string, ToolCall>();
    let finishReason: string | undefined;
    let usage: TokenUsage | undefined;

    for await (const chunk of provider.streamCompletion(messages, tools, options)) {
      this.processChunk(chunk, { text, toolCallMap, finishReason, usage }, (state) => {
        text = state.text;
        finishReason = state.finishReason;
        usage = state.usage;
      });

      if (chunk.type === 'text_delta' && chunk.text) {
        text += chunk.text;
      } else if (chunk.type === 'tool_call_delta' && chunk.toolCall) {
        const tc = chunk.toolCall;
        if (tc.id) {
          const existing = toolCallMap.get(tc.id);
          if (existing) {
            if (tc.name) existing.name = tc.name;
            if (tc.arguments) existing.arguments += tc.arguments;
          } else {
            toolCallMap.set(tc.id, {
              id: tc.id,
              name: tc.name ?? '',
              arguments: tc.arguments ?? '',
            });
          }
        }
      } else if (chunk.type === 'usage' && chunk.usage) {
        usage = {
          input: chunk.usage.inputTokens,
          output: chunk.usage.outputTokens,
          total: chunk.usage.inputTokens + chunk.usage.outputTokens,
        };
        this.sessionTokenUsage.input += chunk.usage.inputTokens;
        this.sessionTokenUsage.output += chunk.usage.outputTokens;
        this.sessionTokenUsage.total +=
          chunk.usage.inputTokens + chunk.usage.outputTokens;
      } else if (chunk.type === 'done') {
        finishReason = chunk.finishReason;
      }
    }

    const toolCalls = toolCallMap.size > 0 ? [...toolCallMap.values()] : undefined;
    return { text, toolCalls, finishReason, usage };
  }

  async *streamCompletionRaw(
    messages: Message[],
    tools: ToolDefinition[],
    options: CompletionOptions = {},
  ): AsyncIterable<StreamChunk> {
    const provider = this.getActiveProvider();
    yield* provider.streamCompletion(messages, tools, options);
  }

  async countTokens(messages: Message[]): Promise<number> {
    const provider = this.getActiveProvider();
    return provider.countTokens(messages);
  }

  getSessionTokenUsage(): TokenUsage {
    return { ...this.sessionTokenUsage };
  }

  resetSessionTokenUsage(): void {
    this.sessionTokenUsage = { input: 0, output: 0, total: 0 };
  }

  private getActiveProvider(): LLMProvider {
    if (!this.binding) {
      throw new LLMProviderUnavailableError('No session bound');
    }
    const provider = this.providers.find((p) => p.id === this.binding!.providerId);
    if (!provider) {
      throw new LLMProviderUnavailableError(
        `Provider ${this.binding.providerId} not found`,
      );
    }
    return provider;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private processChunk(
    _chunk: StreamChunk,
    _state: {
      text: string;
      toolCallMap: Map<string, ToolCall>;
      finishReason: string | undefined;
      usage: TokenUsage | undefined;
    },
    _update: (state: { text: string; finishReason?: string; usage?: TokenUsage }) => void,
  ): void {
    // Accumulation is handled inline in streamCompletion for clarity.
    // This method exists as a seam for subclass overrides.
  }
}
