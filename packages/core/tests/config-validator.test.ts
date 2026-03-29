import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { validateConfig, loadConfig } from '../src/index.js';

const VALID_CONFIG = `{
  gateway: { nats: { url: "nats://localhost:4222" }, redis: { url: "redis://localhost:6379" }, websocket: { port: 18789, allowAnonymous: true }, maxConcurrentAgents: 5 },
  agents: { defaults: { model: "pi-mono", contextWindow: 128000, maxTurns: 100 }, list: [] },
  bindings: [],
  models: { providers: [], fallbacks: [] },
  auth: { profiles: [] },
  session: { compaction: { enabled: true, reserveTokens: 20000 } },
  tools: { allow: ["*"], deny: [], mcpServers: [] },
  sandbox: { mode: "off", scope: "session", docker: { image: "sandbox:latest", memoryLimit: "512m", cpuLimit: "1.0", pidsLimit: 256, networkMode: "none", readOnlyRoot: true, tmpfsSize: "100m", timeout: 30 } },
  plugins: { directories: [], enabled: [], disabled: [] },
}`;

describe('config validator', () => {
  it('accepts a valid config', () => {
    const result = validateConfig(VALID_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.config).toBeDefined();
  });

  it('rejects malformed JSON5', () => {
    const result = validateConfig('{ this is not valid json5 !!!');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/Invalid JSON5/);
  });

  it('rejects non-object config', () => {
    const result = validateConfig('"just a string"');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toBe('Config must be an object');
  });

  it('rejects unknown top-level keys', () => {
    const result = validateConfig(`{
      gateway: {}, agents: { defaults: {}, list: [] }, bindings: [],
      models: {}, auth: {}, session: {}, tools: {}, sandbox: {}, plugins: {},
      unknownKey: "should fail"
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Unknown top-level key'))).toBe(true);
  });

  it('reports missing required sections for legacy format', () => {
    // Legacy format detected when agents is an object with 'defaults'
    const result = validateConfig('{ agents: { defaults: {} } }');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Missing required section'))).toBe(true);
  });

  it('loads and validates the default.json5 file', () => {
    const configPath = resolve(import.meta.dirname, '../../../config/default.json5');
    const result = loadConfig(configPath);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('handles missing file gracefully', () => {
    const result = loadConfig('/nonexistent/path/config.json5');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/Cannot read config file/);
  });

  it('supports JSON5 features (comments, trailing commas)', () => {
    const result = validateConfig(`{
      // This is a comment
      gateway: { nats: { url: "nats://localhost:4222" }, redis: { url: "redis://localhost:6379" }, websocket: { port: 18789, allowAnonymous: true, }, maxConcurrentAgents: 5, },
      agents: { defaults: { model: "pi-mono", contextWindow: 128000, maxTurns: 100, }, list: [], },  // trailing comma
      bindings: [],
      models: { providers: [], fallbacks: [], },
      auth: { profiles: [], },
      session: { compaction: { enabled: true, reserveTokens: 20000, }, },
      tools: {},
      sandbox: { mode: "off", scope: "session", docker: { image: "sandbox:latest", }, },
      plugins: { directories: [], enabled: [], disabled: [], },
    }`);
    expect(result.valid).toBe(true);
  });

  it('accepts config without sharedSecret when allowAnonymous is false', () => {
    const result = validateConfig(`{
      gateway: { nats: { url: "nats://localhost:4222" }, redis: { url: "redis://localhost:6379" }, websocket: { port: 18789, allowAnonymous: false }, maxConcurrentAgents: 5 },
      agents: { defaults: { model: "pi-mono", contextWindow: 128000, maxTurns: 100 }, list: [] },
      bindings: [],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
      session: { compaction: { enabled: true, reserveTokens: 20000 } },
      tools: {},
      sandbox: { mode: "off", scope: "session", docker: { image: "sandbox:latest" } },
      plugins: { directories: [], enabled: [], disabled: [] },
    }`);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates jwtSecret and tokenExpiryMs types', () => {
    const result = validateConfig(`{
      gateway: { nats: { url: "nats://localhost:4222" }, redis: { url: "redis://localhost:6379" }, websocket: { port: 18789, allowAnonymous: true, jwtSecret: 123, tokenExpiryMs: "bad" }, maxConcurrentAgents: 5 },
      agents: { defaults: { model: "pi-mono", contextWindow: 128000, maxTurns: 100 }, list: [] },
      bindings: [],
      models: { providers: [], fallbacks: [] },
      auth: { profiles: [] },
      session: { compaction: { enabled: true, reserveTokens: 20000 } },
      tools: {},
      sandbox: { mode: "off", scope: "session", docker: { image: "sandbox:latest" } },
      plugins: { directories: [], enabled: [], disabled: [] },
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'gateway.websocket.jwtSecret')).toBe(true);
    expect(result.errors.some((e) => e.path === 'gateway.websocket.tokenExpiryMs')).toBe(true);
  });
});

describe('UserConfig (sparse format)', () => {
  it('accepts minimal config with just agents', () => {
    const result = validateConfig(`{
      agents: [
        { id: "assistant", name: "Assistant" }
      ]
    }`);
    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config!.agents.list).toHaveLength(1);
    expect(result.config!.agents.list[0]!.id).toBe('assistant');
  });

  it('fills in all defaults for minimal config', () => {
    const result = validateConfig(`{
      agents: [{ id: "bot", name: "Bot" }]
    }`);
    expect(result.valid).toBe(true);
    const config = result.config!;
    // Gateway defaults
    expect(config.gateway.nats.url).toBe('nats://localhost:4222');
    expect(config.gateway.redis.url).toBe('redis://localhost:6379');
    expect(config.gateway.websocket.port).toBe(18789);
    // Session defaults
    expect(config.session.compaction.enabled).toBe(true);
    expect(config.session.compaction.reserveTokens).toBe(20000);
    // LLM defaults
    expect(config.auth.profiles[0]!.provider).toBe('anthropic');
    expect(config.models.providers[0]!.models[0]).toBe('claude-sonnet-4-6');
    // Auto-generated binding
    expect(config.bindings).toHaveLength(1);
    expect(config.bindings[0]!.agentId).toBe('bot');
  });

  it('accepts config with llm section', () => {
    const result = validateConfig(`{
      agents: [{ id: "assistant", name: "Assistant" }],
      llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4.6" }
    }`);
    expect(result.valid).toBe(true);
    const config = result.config!;
    expect(config.auth.profiles[0]!.provider).toBe('openrouter');
    expect(config.auth.profiles[0]!.apiKeyEnv).toBe('OPENROUTER_API_KEY');
    expect(config.models.providers[0]!.models[0]).toBe('anthropic/claude-sonnet-4.6');
  });

  it('auto-infers apiKeyEnv from provider', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      llm: { provider: "openai-responses" }
    }`);
    expect(result.config!.auth.profiles[0]!.apiKeyEnv).toBe('OPENAI_API_KEY');
  });

  it('accepts gateway overrides', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      gateway: { websocket: { port: 3000 } }
    }`);
    expect(result.config!.gateway.websocket.port).toBe(3000);
    // Other gateway defaults preserved
    expect(result.config!.gateway.nats.url).toBe('nats://localhost:4222');
  });

  it('accepts flat channels config', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      channels: {
        telegram: { enabled: true, allowlist: ["12345"] }
      }
    }`);
    expect(result.config!.channels!.adaptors['telegram']!.enabled).toBe(true);
    expect(result.config!.channels!.adaptors['telegram']!.allowlist).toEqual(['12345']);
  });

  it('rejects agents without id', () => {
    const result = validateConfig(`{
      agents: [{ name: "No ID" }]
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('id'))).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      bogusKey: true
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Unknown top-level key'))).toBe(true);
  });

  it('accepts empty config (defaults for everything)', () => {
    const result = validateConfig('{}');
    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config!.agents.list).toHaveLength(0);
  });

  it('accepts llm with multi-provider config', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      llm: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        providers: [
          { id: "openai-fallback", provider: "openai", model: "gpt-4o" }
        ],
        fallbacks: ["openai-fallback"]
      }
    }`);
    expect(result.valid).toBe(true);
    expect(result.config!.models.providers).toHaveLength(2);
    expect(result.config!.models.fallbacks).toEqual(['openai-fallback']);
  });

  it('rejects llm.providers entries without required fields', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      llm: {
        providers: [
          { provider: "openai", model: "gpt-4o" }
        ]
      }
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'llm.providers[0].id')).toBe(true);
  });

  it('rejects duplicate provider IDs in llm.providers', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      llm: {
        providers: [
          { id: "dup", provider: "openai", model: "gpt-4o" },
          { id: "dup", provider: "anthropic", model: "claude-sonnet-4-6" }
        ]
      }
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate provider ID'))).toBe(true);
  });

  it('rejects llm.fallbacks referencing unknown provider IDs', () => {
    const result = validateConfig(`{
      agents: [{ id: "a", name: "A" }],
      llm: {
        providers: [
          { id: "openai-fallback", provider: "openai", model: "gpt-4o" }
        ],
        fallbacks: ["nonexistent-provider"]
      }
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Unknown provider ID'))).toBe(true);
  });
});

describe('Legacy config referential integrity', () => {
  it('rejects fallbacks referencing unknown provider IDs', () => {
    const result = validateConfig(`{
      gateway: { nats: { url: "nats://localhost:4222" }, redis: { url: "redis://localhost:6379" }, websocket: { port: 18789, allowAnonymous: true }, maxConcurrentAgents: 5 },
      agents: { defaults: { model: "pi-mono", contextWindow: 128000, maxTurns: 100 }, list: [] },
      bindings: [],
      models: { providers: [{ id: "p1", type: "pi-mono", models: ["m1"], profiles: ["default"] }], fallbacks: ["nonexistent"] },
      auth: { profiles: [{ id: "default", provider: "anthropic" }] },
      session: { compaction: { enabled: true, reserveTokens: 20000 } },
      tools: {},
      sandbox: { mode: "off", scope: "session", docker: { image: "sandbox:latest" } },
      plugins: { directories: [], enabled: [], disabled: [] },
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('not found in models.providers'))).toBe(true);
  });

  it('rejects provider profile references not in auth.profiles', () => {
    const result = validateConfig(`{
      gateway: { nats: { url: "nats://localhost:4222" }, redis: { url: "redis://localhost:6379" }, websocket: { port: 18789, allowAnonymous: true }, maxConcurrentAgents: 5 },
      agents: { defaults: { model: "pi-mono", contextWindow: 128000, maxTurns: 100 }, list: [] },
      bindings: [],
      models: { providers: [{ id: "p1", type: "pi-mono", models: ["m1"], profiles: ["ghost-profile"] }], fallbacks: [] },
      auth: { profiles: [{ id: "default", provider: "anthropic" }] },
      session: { compaction: { enabled: true, reserveTokens: 20000 } },
      tools: {},
      sandbox: { mode: "off", scope: "session", docker: { image: "sandbox:latest" } },
      plugins: { directories: [], enabled: [], disabled: [] },
    }`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('not found in auth.profiles'))).toBe(true);
  });
});
