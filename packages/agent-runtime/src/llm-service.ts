import type {
  CompletionOptions,
  LLMProvider,
  Message,
  StreamChunk,
  StreamResponse,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from '@clothos/core';
import type { LLMServiceOptions, ActiveBinding, ModelOverride } from './types.js';
import { LLMProviderUnavailableError } from './errors.js';

/**
 * Orchestrates LLM providers with:
 * - Auth profile rotation: try profiles in order within a provider, then across providers.
 * - Availability checking: use `isAvailable()` before binding to a provider.
 * - Session-sticky selection: same provider+profile for the lifetime of a session.
 * - Model overrides: per-dispatch model override from binding overrides.
 * - Fallback on error: try fallback providers when the active one throws.
 */
export class LLMService {
  private readonly options: LLMServiceOptions;
  private binding: ActiveBinding | null = null;
  private sessionTokenUsage: TokenUsage = { input: 0, output: 0, total: 0 };
  private modelOverride: ModelOverride | null = null;

  constructor(options: LLMServiceOptions) {
    this.options = options;
  }

  /**
   * Bind a session to the best available provider+profile pair.
   *
   * Selection algorithm:
   * 1. For each provider (in order), check `isAvailable()` if defined.
   * 2. For available providers, find matching auth profiles.
   * 3. Bind to the first available provider with a valid profile.
   * 4. If no provider has `isAvailable()`, fall back to the first provider.
   */
  async bindSession(sessionId: string): Promise<void> {
    if (this.options.providers.length === 0) {
      throw new LLMProviderUnavailableError();
    }

    // Try each provider in order, checking availability
    for (const provider of this.options.providers) {
      if (provider.isAvailable) {
        try {
          const available = await provider.isAvailable();
          if (!available) continue;
        } catch {
          continue; // Treat errors as unavailable
        }
      }

      const profileId = this.findProfileForProvider(provider.id);

      this.binding = {
        providerId: provider.id,
        profileId: profileId ?? provider.id,
        sessionId,
      };
      return;
    }

    // All providers with isAvailable() returned false — fall back to first provider
    const fallbackProvider = this.options.providers[0]!;
    const profileId = this.findProfileForProvider(fallbackProvider.id);
    this.binding = {
      providerId: fallbackProvider.id,
      profileId: profileId ?? fallbackProvider.id,
      sessionId,
    };
  }

  /**
   * Synchronous bind for backward compatibility (no availability check).
   */
  bindSessionSync(sessionId: string): void {
    if (this.options.providers.length === 0) {
      throw new LLMProviderUnavailableError();
    }
    const provider = this.options.providers[0]!;
    const profileId = this.findProfileForProvider(provider.id);
    this.binding = {
      providerId: provider.id,
      profileId: profileId ?? provider.id,
      sessionId,
    };
  }

  unbindSession(): void {
    this.binding = null;
    this.modelOverride = null;
  }

  /**
   * Set a temporary model override for the current dispatch.
   * Call clearModelOverride() after the dispatch completes.
   */
  setModelOverride(override: ModelOverride): void {
    this.modelOverride = override;
  }

  clearModelOverride(): void {
    this.modelOverride = null;
  }

  async streamCompletion(
    messages: Message[],
    tools: ToolDefinition[],
    options: CompletionOptions = {},
  ): Promise<StreamResponse> {
    const provider = this.getActiveProvider();

    // Apply model override if set
    const effectiveOptions = this.applyModelOverride(options);

    try {
      return await this.runCompletion(provider, messages, tools, effectiveOptions);
    } catch (err) {
      // Try profile rotation within the same provider type first
      const rotatedProvider = await this.tryProfileRotation(provider.id);
      if (rotatedProvider && rotatedProvider.id !== provider.id) {
        try {
          return await this.runCompletion(rotatedProvider, messages, tools, effectiveOptions);
        } catch {
          // Continue to fallback providers
        }
      }

      // Try fallback providers
      const fallbackIds = this.options.models.fallbacks;
      let lastError = err;

      for (const fallbackId of fallbackIds) {
        const fallbackProvider = this.options.providers.find((p) => p.id === fallbackId);
        if (!fallbackProvider || fallbackProvider.id === provider.id) continue;

        // Check availability before trying fallback
        if (fallbackProvider.isAvailable) {
          try {
            const available = await fallbackProvider.isAvailable();
            if (!available) continue;
          } catch {
            continue;
          }
        }

        try {
          const result = await this.runCompletion(fallbackProvider, messages, tools, effectiveOptions);
          // Update binding to the successful fallback provider
          if (this.binding) {
            const profileId = this.findProfileForProvider(fallbackProvider.id);
            this.binding = {
              ...this.binding,
              providerId: fallbackProvider.id,
              profileId: profileId ?? fallbackProvider.id,
            };
          }
          return result;
        } catch (fallbackErr) {
          lastError = fallbackErr;
        }
      }

      throw lastError;
    }
  }

  async *streamCompletionRaw(
    messages: Message[],
    tools: ToolDefinition[],
    options: CompletionOptions = {},
  ): AsyncIterable<StreamChunk> {
    const provider = this.getActiveProvider();
    const effectiveOptions = this.applyModelOverride(options);
    yield* provider.streamCompletion(messages, tools, effectiveOptions);
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

  /** Get the currently bound provider ID (for diagnostics). */
  getActiveProviderId(): string | undefined {
    return this.binding?.providerId;
  }

  /** Get the currently bound profile ID (for diagnostics). */
  getActiveProfileId(): string | undefined {
    return this.binding?.profileId;
  }

  /**
   * Find an auth profile matching a provider ID.
   * Profiles are tried in config order — the first match wins.
   */
  private findProfileForProvider(providerId: string): string | undefined {
    // Look through model providers to find which provider type this ID maps to
    const modelProvider = this.options.models.providers.find((mp) => mp.id === providerId);
    const providerType = modelProvider?.type ?? providerId;

    // Find a matching auth profile
    for (const profile of this.options.auth.profiles) {
      if (profile.provider === providerType || profile.provider === providerId) {
        return profile.id;
      }
    }
    return undefined;
  }

  /**
   * Try rotating to the next auth profile for the same provider type.
   * Returns a different LLMProvider instance if one is found with a different profile.
   */
  private async tryProfileRotation(currentProviderId: string): Promise<LLMProvider | undefined> {
    const currentProvider = this.options.models.providers.find((mp) => mp.id === currentProviderId);
    if (!currentProvider) return undefined;

    // Find other LLM providers of the same type
    const sameTypeProviders = this.options.providers.filter(
      (p) => p.id !== currentProviderId && this.isSameProviderType(p.id, currentProviderId),
    );

    for (const candidate of sameTypeProviders) {
      if (candidate.isAvailable) {
        try {
          const available = await candidate.isAvailable();
          if (!available) continue;
        } catch {
          continue;
        }
      }
      return candidate;
    }

    return undefined;
  }

  /** Check if two provider IDs share the same provider type. */
  private isSameProviderType(idA: string, idB: string): boolean {
    const mpA = this.options.models.providers.find((mp) => mp.id === idA);
    const mpB = this.options.models.providers.find((mp) => mp.id === idB);
    if (mpA && mpB) return mpA.type === mpB.type;
    return false;
  }

  private applyModelOverride(options: CompletionOptions): CompletionOptions {
    if (this.modelOverride) {
      return { ...options, model: this.modelOverride.model };
    }
    return options;
  }

  private getActiveProvider(): LLMProvider {
    if (!this.binding) {
      throw new LLMProviderUnavailableError('No session bound');
    }
    const provider = this.options.providers.find((p) => p.id === this.binding!.providerId);
    if (!provider) {
      throw new LLMProviderUnavailableError(
        `Provider ${this.binding.providerId} not found`,
      );
    }
    return provider;
  }

  private async runCompletion(
    provider: LLMProvider,
    messages: Message[],
    tools: ToolDefinition[],
    options: CompletionOptions,
  ): Promise<StreamResponse> {
    let text = '';
    let thinking = '';
    const toolCallMap = new Map<string, ToolCall>();
    let finishReason: string | undefined;
    let usage: TokenUsage | undefined;

    for await (const chunk of provider.streamCompletion(messages, tools, options)) {
      if (chunk.type === 'text_delta' && chunk.text) {
        text += chunk.text;
      } else if (chunk.type === 'thinking_delta' && chunk.thinking) {
        thinking += chunk.thinking;
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
    return { text, thinking: thinking || undefined, toolCalls, finishReason, usage };
  }
}
