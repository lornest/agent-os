import { describe, it, expect } from 'vitest';
import type { LLMProvider, Message, StreamChunk, ToolDefinition } from '@agentic-os/core';
import { LLMService } from '../src/llm-service.js';
import { LLMProviderUnavailableError } from '../src/errors.js';

function createMockProvider(
  id: string,
  chunks: StreamChunk[],
  tokenCount = 100,
): LLMProvider {
  return {
    id,
    supportsPromptCaching: false,
    async *streamCompletion(
      _messages: Message[],
      _tools: ToolDefinition[],
    ): AsyncIterable<StreamChunk> {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
    async countTokens(): Promise<number> {
      return tokenCount;
    },
  };
}

describe('LLMService', () => {
  it('binds session to first available provider', () => {
    const provider = createMockProvider('p1', []);
    const service = new LLMService({
      providers: [provider],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });

    service.bindSession('session-1');
    // Should not throw — binding is successful
    service.unbindSession();
  });

  it('throws when no providers available', () => {
    const service = new LLMService({
      providers: [],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });

    expect(() => service.bindSession('s1')).toThrow(LLMProviderUnavailableError);
  });

  it('accumulates text_delta chunks into text', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ' world' },
      { type: 'done', finishReason: 'stop' },
    ];
    const service = new LLMService({
      providers: [createMockProvider('p1', chunks)],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });
    service.bindSession('s1');

    const response = await service.streamCompletion(
      [{ role: 'user', content: 'Hi' }],
      [],
    );

    expect(response.text).toBe('Hello world');
    expect(response.finishReason).toBe('stop');
    expect(response.toolCalls).toBeUndefined();
  });

  it('merges tool_call_delta chunks by ID', async () => {
    const chunks: StreamChunk[] = [
      { type: 'tool_call_delta', toolCall: { id: 'tc1', name: 'search', arguments: '{"q":' } },
      { type: 'tool_call_delta', toolCall: { id: 'tc1', arguments: '"hello"}' } },
      { type: 'done', finishReason: 'tool_calls' },
    ];
    const service = new LLMService({
      providers: [createMockProvider('p1', chunks)],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });
    service.bindSession('s1');

    const response = await service.streamCompletion(
      [{ role: 'user', content: 'search' }],
      [],
    );

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0]).toEqual({
      id: 'tc1',
      name: 'search',
      arguments: '{"q":"hello"}',
    });
  });

  it('tracks session token usage', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text_delta', text: 'Hi' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'done', finishReason: 'stop' },
    ];
    const service = new LLMService({
      providers: [createMockProvider('p1', chunks)],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });
    service.bindSession('s1');

    await service.streamCompletion([{ role: 'user', content: 'Hi' }], []);

    const usage = service.getSessionTokenUsage();
    expect(usage.input).toBe(10);
    expect(usage.output).toBe(5);
    expect(usage.total).toBe(15);

    // Accumulates across calls
    await service.streamCompletion([{ role: 'user', content: 'Hi' }], []);
    const usage2 = service.getSessionTokenUsage();
    expect(usage2.input).toBe(20);
    expect(usage2.total).toBe(30);

    service.resetSessionTokenUsage();
    expect(service.getSessionTokenUsage().total).toBe(0);
  });

  it('session stickiness — uses same provider across calls', async () => {
    const calls: string[] = [];
    const p1: LLMProvider = {
      id: 'p1',
      supportsPromptCaching: false,
      async *streamCompletion() {
        calls.push('p1');
        yield { type: 'done' as const, finishReason: 'stop' };
      },
      async countTokens() { return 10; },
    };
    const p2: LLMProvider = {
      id: 'p2',
      supportsPromptCaching: false,
      async *streamCompletion() {
        calls.push('p2');
        yield { type: 'done' as const, finishReason: 'stop' };
      },
      async countTokens() { return 10; },
    };

    const service = new LLMService({
      providers: [p1, p2],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });
    service.bindSession('s1');

    await service.streamCompletion([], []);
    await service.streamCompletion([], []);

    expect(calls).toEqual(['p1', 'p1']);
  });

  it('throws when calling streamCompletion without binding', async () => {
    const service = new LLMService({
      providers: [createMockProvider('p1', [])],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });

    await expect(
      service.streamCompletion([], []),
    ).rejects.toThrow(LLMProviderUnavailableError);
  });

  it('countTokens delegates to active provider', async () => {
    const service = new LLMService({
      providers: [createMockProvider('p1', [], 42)],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
    });
    service.bindSession('s1');

    const count = await service.countTokens([{ role: 'user', content: 'Hello' }]);
    expect(count).toBe(42);
  });
});
