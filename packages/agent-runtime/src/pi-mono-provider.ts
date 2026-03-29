import type {
  CompletionOptions,
  LLMProvider,
  Message as AosMessage,
  StreamChunk,
  ToolDefinition,
} from '@clothos/core';
import { stream, getModel } from '@mariozechner/pi-ai';
import type {
  Api,
  AssistantMessage as PiAssistantMessage,
  Context as PiContext,
  Model,
  Tool as PiTool,
  ToolCall as PiToolCall,
  UserMessage as PiUserMessage,
  ToolResultMessage as PiToolResultMessage,
} from '@mariozechner/pi-ai';
import type { TSchema } from '@mariozechner/pi-ai';

export interface PiMonoProviderOptions {
  model: Model<Api>;
  id?: string;
}

/**
 * LLMProvider wrapping pi-ai's `stream()` function.
 * Converts between agent-os message/event types and pi-ai types.
 */
export class PiMonoProvider implements LLMProvider {
  readonly id: string;
  readonly supportsPromptCaching = true;

  private model: Model<Api>;

  constructor(options: PiMonoProviderOptions) {
    this.model = options.model;
    this.id = options.id ?? 'pi-mono';
  }

  /**
   * Resolve the effective model for a completion request.
   * If options.model is set and differs from the default, attempt to
   * look up the new model via pi-ai's getModel(). Falls back to
   * the default model if the override ID is unknown.
   */
  private resolveModel(options: CompletionOptions): Model<Api> {
    if (!options.model || options.model === this.model.id) {
      return this.model;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider/model IDs are dynamic strings at runtime
      return getModel(this.model.provider as any, options.model as any);
    } catch {
      // Unknown model ID — fall back to the default
      return this.model;
    }
  }

  async *streamCompletion(
    messages: AosMessage[],
    tools: ToolDefinition[],
    options: CompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const effectiveModel = this.resolveModel(options);
    const context = this.buildContext(messages, tools, effectiveModel);

    const eventStream = stream(effectiveModel, context, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    for await (const event of eventStream) {
      if (event.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta };
      } else if (event.type === 'toolcall_end') {
        yield {
          type: 'tool_call_delta',
          toolCall: {
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments),
          },
        };
      } else if (event.type === 'done') {
        yield {
          type: 'usage',
          usage: {
            inputTokens: event.message.usage.input,
            outputTokens: event.message.usage.output,
          },
        };
        yield {
          type: 'done',
          finishReason: mapStopReason(event.reason),
        };
      } else if (event.type === 'thinking_delta') {
        yield { type: 'thinking_delta', thinking: (event as Record<string, unknown>).delta as string };
      } else if (event.type === 'error') {
        const raw = (event as Record<string, unknown>).error;
        console.error(`[LLM] pi-ai stream error:`, JSON.stringify(raw, null, 2));
        yield { type: 'done', finishReason: 'error' };
      }
      // Ignore: start, text_start, text_end, thinking_start, thinking_end, toolcall_start, toolcall_delta
    }
  }

  async countTokens(messages: AosMessage[]): Promise<number> {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length;
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          totalChars += tc.name.length + tc.arguments.length;
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }

  /** Convert agent-os messages + tools into a pi-ai Context. */
  private buildContext(messages: AosMessage[], tools: ToolDefinition[], effectiveModel: Model<Api>): PiContext {
    let systemPrompt: string | undefined;
    const piMessages: (PiUserMessage | PiAssistantMessage | PiToolResultMessage)[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else if (msg.role === 'user') {
        piMessages.push({
          role: 'user',
          content: [{ type: 'text', text: msg.content }],
          timestamp: Date.now(),
        });
      } else if (msg.role === 'assistant') {
        piMessages.push(this.convertAssistantMessage(msg, effectiveModel));
      } else if (msg.role === 'tool') {
        piMessages.push(this.convertToolResultMessage(msg, piMessages));
      }
    }

    const piTools: PiTool[] | undefined =
      tools.length > 0
        ? tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema as TSchema,
          }))
        : undefined;

    return { systemPrompt, messages: piMessages, tools: piTools };
  }

  /** Convert an agent-os assistant message to a pi-ai AssistantMessage. */
  private convertAssistantMessage(msg: AosMessage, effectiveModel: Model<Api>): PiAssistantMessage {
    const content: (
      | { type: 'text'; text: string }
      | PiToolCall
    )[] = [];

    if (msg.content) {
      content.push({ type: 'text', text: msg.content });
    }

    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        content.push({
          type: 'toolCall',
          id: tc.id,
          name: tc.name,
          arguments: safeParseJson(tc.arguments),
        });
      }
    }

    return {
      role: 'assistant',
      content,
      api: effectiveModel.api,
      provider: effectiveModel.provider,
      model: effectiveModel.id,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop',
      timestamp: Date.now(),
    };
  }

  /** Convert an agent-os tool result message to a pi-ai ToolResultMessage. */
  private convertToolResultMessage(
    msg: AosMessage,
    preceding: (PiUserMessage | PiAssistantMessage | PiToolResultMessage)[],
  ): PiToolResultMessage {
    // Look up toolName from the preceding assistant message's tool calls
    let toolName = 'unknown';
    if (msg.toolCallId) {
      for (let i = preceding.length - 1; i >= 0; i--) {
        const prev = preceding[i]!;
        if (prev.role === 'assistant') {
          for (const block of prev.content) {
            if (block.type === 'toolCall' && block.id === msg.toolCallId) {
              toolName = block.name;
              break;
            }
          }
          break;
        }
      }
    }

    return {
      role: 'toolResult',
      toolCallId: msg.toolCallId ?? '',
      toolName,
      content: [{ type: 'text', text: msg.content }],
      isError: false,
      timestamp: Date.now(),
    };
  }
}

/** Map pi-ai stop reasons to agent-os finish reasons. */
function mapStopReason(reason: string): string {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'toolUse':
      return 'tool_calls';
    case 'length':
      return 'length';
    default:
      return reason;
  }
}

/** Safely parse a JSON string into an object, returning {} on failure. */
function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return {};
  }
}
