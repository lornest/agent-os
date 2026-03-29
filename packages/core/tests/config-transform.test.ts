import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config-transform.js';

describe('resolveConfig', () => {
  it('maps single-provider llm shorthand to models + auth', () => {
    const config = resolveConfig({
      llm: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' },
    });

    expect(config.models.providers).toHaveLength(1);
    expect(config.models.providers[0]!.models[0]).toBe('anthropic/claude-sonnet-4.6');
    expect(config.auth.profiles).toHaveLength(1);
    expect(config.auth.profiles[0]!.provider).toBe('openrouter');
    expect(config.auth.profiles[0]!.apiKeyEnv).toBe('OPENROUTER_API_KEY');
    expect(config.models.fallbacks).toEqual([]);
  });

  it('auto-infers apiKeyEnv from PROVIDER_API_KEY_MAP', () => {
    const config = resolveConfig({
      llm: { provider: 'openai-responses' },
    });
    expect(config.auth.profiles[0]!.apiKeyEnv).toBe('OPENAI_API_KEY');
  });

  it('falls back to uppercased provider name for unknown providers', () => {
    const config = resolveConfig({
      llm: { provider: 'my-custom-provider' },
    });
    expect(config.auth.profiles[0]!.apiKeyEnv).toBe('MY_CUSTOM_PROVIDER_API_KEY');
  });

  it('maps multi-provider llm config to additional ModelProvider + AuthProfile entries', () => {
    const config = resolveConfig({
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        providers: [
          { id: 'openai-fallback', provider: 'openai', model: 'gpt-4o' },
          { id: 'openrouter-backup', provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' },
        ],
      },
    });

    // 3 providers total: primary + 2 additional
    expect(config.models.providers).toHaveLength(3);
    expect(config.models.providers[0]!.id).toBe('pi-mono');
    expect(config.models.providers[1]!.id).toBe('openai-fallback');
    expect(config.models.providers[1]!.models[0]).toBe('gpt-4o');
    expect(config.models.providers[2]!.id).toBe('openrouter-backup');

    // 3 auth profiles
    expect(config.auth.profiles).toHaveLength(3);
    expect(config.auth.profiles[0]!.id).toBe('default');
    expect(config.auth.profiles[0]!.provider).toBe('anthropic');
    expect(config.auth.profiles[1]!.id).toBe('openai-fallback');
    expect(config.auth.profiles[1]!.provider).toBe('openai');
    expect(config.auth.profiles[1]!.apiKeyEnv).toBe('OPENAI_API_KEY');
    expect(config.auth.profiles[2]!.id).toBe('openrouter-backup');
    expect(config.auth.profiles[2]!.apiKeyEnv).toBe('OPENROUTER_API_KEY');
  });

  it('auto-generates fallback order from provider declaration order', () => {
    const config = resolveConfig({
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        providers: [
          { id: 'openai-fallback', provider: 'openai', model: 'gpt-4o' },
          { id: 'openrouter-backup', provider: 'openrouter', model: 'gpt-4o' },
        ],
      },
    });

    expect(config.models.fallbacks).toEqual(['openai-fallback', 'openrouter-backup']);
  });

  it('uses explicit fallbacks when provided', () => {
    const config = resolveConfig({
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        providers: [
          { id: 'openai-fallback', provider: 'openai', model: 'gpt-4o' },
          { id: 'openrouter-backup', provider: 'openrouter', model: 'gpt-4o' },
        ],
        fallbacks: ['openrouter-backup'], // Only fallback to openrouter, skip openai
      },
    });

    expect(config.models.fallbacks).toEqual(['openrouter-backup']);
  });

  it('preserves authMode from provider entries', () => {
    const config = resolveConfig({
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        authMode: 'oauth',
        providers: [
          { id: 'openai-oauth', provider: 'openai', model: 'gpt-4o', authMode: 'oauth' },
        ],
      },
    });

    expect(config.auth.profiles[0]!.authMode).toBe('oauth');
    expect(config.auth.profiles[1]!.authMode).toBe('oauth');
  });

  it('uses custom apiKeyEnv from provider entries', () => {
    const config = resolveConfig({
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        providers: [
          { id: 'custom', provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'MY_SPECIAL_KEY' },
        ],
      },
    });

    expect(config.auth.profiles[1]!.apiKeyEnv).toBe('MY_SPECIAL_KEY');
  });

  it('uses defaults when no llm section is provided', () => {
    const config = resolveConfig({});

    // Should have the defaults from CONFIG_DEFAULTS
    expect(config.models.providers[0]!.models[0]).toBe('claude-sonnet-4-6');
    expect(config.auth.profiles[0]!.provider).toBe('anthropic');
    expect(config.models.fallbacks).toEqual([]);
  });

  it('auto-generates binding when agents provided without bindings', () => {
    const config = resolveConfig({
      agents: [{ id: 'bot', name: 'Bot' }],
    });

    expect(config.bindings).toHaveLength(1);
    expect(config.bindings[0]!.agentId).toBe('bot');
  });
});
