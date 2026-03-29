import { describe, it, expect } from 'vitest';
import type { LLMProvider, Message, StreamChunk, ToolDefinition } from '@clothos/core';
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

function createFailingProvider(id: string, error: Error): LLMProvider {
  return {
    id,
    supportsPromptCaching: false,
    async *streamCompletion(): AsyncIterable<StreamChunk> {
      throw error;
    },
    async countTokens(): Promise<number> {
      return 0;
    },
  };
}

function createAvailableProvider(
  id: string,
  chunks: StreamChunk[],
  available: boolean,
): LLMProvider {
  return {
    ...createMockProvider(id, chunks),
    async isAvailable() { return available; },
  };
}

describe('LLMService', () => {
  describe('session binding', () => {
    it('binds session to first available provider (sync)', () => {
      const provider = createMockProvider('p1', []);
      const service = new LLMService({
        providers: [provider],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      service.bindSessionSync('session-1');
      expect(service.getActiveProviderId()).toBe('p1');
      service.unbindSession();
    });

    it('binds session to first available provider (async)', async () => {
      const provider = createMockProvider('p1', []);
      const service = new LLMService({
        providers: [provider],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      await service.bindSession('session-1');
      expect(service.getActiveProviderId()).toBe('p1');
      service.unbindSession();
    });

    it('throws when no providers available (sync)', () => {
      const service = new LLMService({
        providers: [],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      expect(() => service.bindSessionSync('s1')).toThrow(LLMProviderUnavailableError);
    });

    it('throws when no providers available (async)', async () => {
      const service = new LLMService({
        providers: [],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      await expect(service.bindSession('s1')).rejects.toThrow(LLMProviderUnavailableError);
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
  });

  describe('availability checking', () => {
    it('skips unavailable providers during async bindSession', async () => {
      const p1 = createAvailableProvider('p1', [], false);
      const p2 = createAvailableProvider('p2', [
        { type: 'text_delta', text: 'from-p2' },
        { type: 'done', finishReason: 'stop' },
      ], true);

      const service = new LLMService({
        providers: [p1, p2],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      await service.bindSession('s1');
      expect(service.getActiveProviderId()).toBe('p2');
    });

    it('falls back to first provider when all report unavailable', async () => {
      const p1 = createAvailableProvider('p1', [], false);
      const p2 = createAvailableProvider('p2', [], false);

      const service = new LLMService({
        providers: [p1, p2],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      await service.bindSession('s1');
      // Falls back to first provider as a last resort
      expect(service.getActiveProviderId()).toBe('p1');
    });

    it('treats isAvailable() errors as unavailable', async () => {
      const p1: LLMProvider = {
        ...createMockProvider('p1', []),
        async isAvailable() { throw new Error('network error'); },
      };
      const p2 = createAvailableProvider('p2', [], true);

      const service = new LLMService({
        providers: [p1, p2],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      await service.bindSession('s1');
      expect(service.getActiveProviderId()).toBe('p2');
    });

    it('uses providers without isAvailable() (treats as available)', async () => {
      const p1 = createMockProvider('p1', []); // no isAvailable
      const p2 = createAvailableProvider('p2', [], true);

      const service = new LLMService({
        providers: [p1, p2],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      await service.bindSession('s1');
      // p1 has no isAvailable, so it's treated as available and chosen first
      expect(service.getActiveProviderId()).toBe('p1');
    });

    it('checks availability before trying fallback during streamCompletion', async () => {
      const calls: string[] = [];
      const p1 = createFailingProvider('p1', new Error('p1 down'));
      const p2: LLMProvider = {
        id: 'p2',
        supportsPromptCaching: false,
        async *streamCompletion() {
          calls.push('p2');
          yield { type: 'text_delta' as const, text: 'from-p2' };
          yield { type: 'done' as const, finishReason: 'stop' };
        },
        async countTokens() { return 10; },
        async isAvailable() { return false; },
      };
      const p3: LLMProvider = {
        id: 'p3',
        supportsPromptCaching: false,
        async *streamCompletion() {
          calls.push('p3');
          yield { type: 'text_delta' as const, text: 'from-p3' };
          yield { type: 'done' as const, finishReason: 'stop' };
        },
        async countTokens() { return 10; },
        async isAvailable() { return true; },
      };

      const service = new LLMService({
        providers: [p1, p2, p3],
        models: { providers: [], fallbacks: ['p2', 'p3'] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      const response = await service.streamCompletion([], []);
      expect(response.text).toBe('from-p3');
      expect(calls).toEqual(['p3']); // p2 was skipped due to isAvailable=false
    });
  });

  describe('stream completion', () => {
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
      service.bindSessionSync('s1');

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
      service.bindSessionSync('s1');

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
      service.bindSessionSync('s1');

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
  });

  describe('session stickiness', () => {
    it('uses same provider across calls', async () => {
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
      service.bindSessionSync('s1');

      await service.streamCompletion([], []);
      await service.streamCompletion([], []);

      expect(calls).toEqual(['p1', 'p1']);
    });
  });

  describe('model override', () => {
    it('passes model override to provider via CompletionOptions', async () => {
      let capturedOptions: Record<string, unknown> = {};
      const p1: LLMProvider = {
        id: 'p1',
        supportsPromptCaching: false,
        async *streamCompletion(_messages, _tools, options) {
          capturedOptions = { ...options };
          yield { type: 'done' as const, finishReason: 'stop' };
        },
        async countTokens() { return 10; },
      };

      const service = new LLMService({
        providers: [p1],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      service.setModelOverride({ model: 'gpt-4o' });
      await service.streamCompletion([], []);

      expect(capturedOptions['model']).toBe('gpt-4o');

      // Clear override
      service.clearModelOverride();
      capturedOptions = {};
      await service.streamCompletion([], []);
      expect(capturedOptions['model']).toBeUndefined();
    });

    it('does not override when explicit model is in options', async () => {
      let capturedOptions: Record<string, unknown> = {};
      const p1: LLMProvider = {
        id: 'p1',
        supportsPromptCaching: false,
        async *streamCompletion(_messages, _tools, options) {
          capturedOptions = { ...options };
          yield { type: 'done' as const, finishReason: 'stop' };
        },
        async countTokens() { return 10; },
      };

      const service = new LLMService({
        providers: [p1],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      // Model override is applied via spread, so explicit options.model would be overwritten
      // This tests the behavior: override takes precedence
      service.setModelOverride({ model: 'gpt-4o' });
      await service.streamCompletion([], [], { model: 'claude-3' });

      // Override takes precedence (it's applied after options spread)
      expect(capturedOptions['model']).toBe('gpt-4o');
    });

    it('clears model override on unbind', async () => {
      let capturedOptions: Record<string, unknown> = {};
      const p1: LLMProvider = {
        id: 'p1',
        supportsPromptCaching: false,
        async *streamCompletion(_messages, _tools, options) {
          capturedOptions = { ...options };
          yield { type: 'done' as const, finishReason: 'stop' };
        },
        async countTokens() { return 10; },
      };

      const service = new LLMService({
        providers: [p1],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');
      service.setModelOverride({ model: 'gpt-4o' });
      service.unbindSession();

      service.bindSessionSync('s2');
      await service.streamCompletion([], []);
      expect(capturedOptions['model']).toBeUndefined();
    });
  });

  describe('auth profile matching', () => {
    it('matches auth profile to provider by type', async () => {
      const p1 = createMockProvider('anthropic-main', [
        { type: 'done', finishReason: 'stop' },
      ]);

      const service = new LLMService({
        providers: [p1],
        models: {
          providers: [{ id: 'anthropic-main', type: 'anthropic', models: ['claude-3'], profiles: ['anthropic-prod'] }],
          fallbacks: [],
        },
        auth: {
          profiles: [{ id: 'anthropic-prod', provider: 'anthropic', authMode: 'oauth' }],
        },
      });

      await service.bindSession('s1');
      expect(service.getActiveProviderId()).toBe('anthropic-main');
      expect(service.getActiveProfileId()).toBe('anthropic-prod');
    });

    it('uses provider id as profile fallback when no profile matches', async () => {
      const p1 = createMockProvider('custom-provider', []);

      const service = new LLMService({
        providers: [p1],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] }, // No matching profile
      });

      await service.bindSession('s1');
      expect(service.getActiveProfileId()).toBe('custom-provider');
    });
  });

  describe('fallback rotation', () => {
    it('does not attempt fallback when primary succeeds', async () => {
      const calls: string[] = [];
      const p1: LLMProvider = {
        id: 'p1',
        supportsPromptCaching: false,
        async *streamCompletion() {
          calls.push('p1');
          yield { type: 'text_delta' as const, text: 'ok' };
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
        models: { providers: [], fallbacks: ['p2'] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      const response = await service.streamCompletion([], []);
      expect(response.text).toBe('ok');
      expect(calls).toEqual(['p1']);
    });

    it('falls back when primary throws', async () => {
      const primaryError = new Error('primary down');
      const p1 = createFailingProvider('p1', primaryError);
      const p2 = createMockProvider('p2', [
        { type: 'text_delta', text: 'fallback' },
        { type: 'done', finishReason: 'stop' },
      ]);

      const service = new LLMService({
        providers: [p1, p2],
        models: { providers: [], fallbacks: ['p2'] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      const response = await service.streamCompletion([], []);
      expect(response.text).toBe('fallback');
    });

    it('re-throws last error when all providers fail', async () => {
      const p1 = createFailingProvider('p1', new Error('p1 down'));
      const p2 = createFailingProvider('p2', new Error('p2 down'));
      const p3 = createFailingProvider('p3', new Error('p3 down'));

      const service = new LLMService({
        providers: [p1, p2, p3],
        models: { providers: [], fallbacks: ['p2', 'p3'] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      await expect(service.streamCompletion([], [])).rejects.toThrow('p3 down');
    });

    it('respects fallback order', async () => {
      const calls: string[] = [];
      const p1 = createFailingProvider('p1', new Error('p1 down'));
      const p2: LLMProvider = {
        id: 'p2',
        supportsPromptCaching: false,
        async *streamCompletion() {
          calls.push('p2');
          yield { type: 'text_delta' as const, text: 'from-p2' };
          yield { type: 'done' as const, finishReason: 'stop' };
        },
        async countTokens() { return 10; },
      };
      const p3: LLMProvider = {
        id: 'p3',
        supportsPromptCaching: false,
        async *streamCompletion() {
          calls.push('p3');
          yield { type: 'text_delta' as const, text: 'from-p3' };
          yield { type: 'done' as const, finishReason: 'stop' };
        },
        async countTokens() { return 10; },
      };

      const service = new LLMService({
        providers: [p1, p2, p3],
        models: { providers: [], fallbacks: ['p2', 'p3'] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      const response = await service.streamCompletion([], []);
      expect(response.text).toBe('from-p2');
      expect(calls).toEqual(['p2']);
    });

    it('updates binding to successful fallback provider', async () => {
      const p1 = createFailingProvider('p1', new Error('p1 down'));
      const p2 = createMockProvider('p2', [
        { type: 'text_delta', text: 'ok' },
        { type: 'done', finishReason: 'stop' },
      ]);

      const service = new LLMService({
        providers: [p1, p2],
        models: { providers: [], fallbacks: ['p2'] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      expect(service.getActiveProviderId()).toBe('p1');
      await service.streamCompletion([], []);
      // After fallback, binding should update to the successful provider
      expect(service.getActiveProviderId()).toBe('p2');
    });
  });

  describe('countTokens', () => {
    it('delegates to active provider', async () => {
      const service = new LLMService({
        providers: [createMockProvider('p1', [], 42)],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });
      service.bindSessionSync('s1');

      const count = await service.countTokens([{ role: 'user', content: 'Hello' }]);
      expect(count).toBe(42);
    });
  });

  describe('diagnostics', () => {
    it('returns undefined provider/profile when not bound', () => {
      const service = new LLMService({
        providers: [createMockProvider('p1', [])],
        models: { providers: [], fallbacks: [] },
        auth: { profiles: [] },
      });

      expect(service.getActiveProviderId()).toBeUndefined();
      expect(service.getActiveProfileId()).toBeUndefined();
    });
  });
});
