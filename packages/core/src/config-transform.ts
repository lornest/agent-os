import type { ClothosConfig } from './config.js';
import type { ChannelsConfig } from './channels.js';
import type { UserConfig } from './user-config.js';
import { CONFIG_DEFAULTS, PROVIDER_API_KEY_MAP } from './config-defaults.js';
import { deepMerge, isRecord } from './utils.js';

/**
 * Resolve a sparse UserConfig into a fully-populated ClothosConfig
 * by merging with defaults and transforming structural differences.
 */
export function resolveConfig(userConfig: UserConfig): ClothosConfig {
  // Start with a deep copy of defaults
  let config = structuredClone(CONFIG_DEFAULTS);

  // Apply llm section → models + auth
  if (userConfig.llm) {
    const { provider = 'anthropic', model = 'claude-sonnet-4-6', apiKeyEnv } = userConfig.llm;
    const resolvedApiKeyEnv = apiKeyEnv ?? PROVIDER_API_KEY_MAP[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;

    config.models = {
      providers: [
        {
          id: 'pi-mono',
          type: 'pi-mono',
          models: [model],
          profiles: ['default'],
        },
      ],
      fallbacks: [],
    };

    config.auth = {
      profiles: [
        {
          id: 'default',
          provider,
          apiKeyEnv: resolvedApiKeyEnv,
        },
      ],
    };
  }

  // Apply agents (flat array → { defaults, list })
  if (userConfig.agents) {
    config.agents = {
      ...config.agents,
      list: userConfig.agents,
    };
  }

  // Auto-generate default binding if none provided and agents exist
  if (!userConfig.bindings && config.agents.list.length > 0) {
    config.bindings = [
      { channel: 'default', agentId: config.agents.list[0]!.id },
    ];
  } else if (userConfig.bindings) {
    config.bindings = userConfig.bindings;
  }

  // Merge optional sections using deepMerge
  if (userConfig.gateway) {
    config = { ...config, gateway: deepMerge(config.gateway, userConfig.gateway) };
  }
  if (userConfig.session) {
    config = { ...config, session: deepMerge(config.session, userConfig.session) };
  }
  if (userConfig.tools) {
    config = { ...config, tools: deepMerge(config.tools, userConfig.tools) };
  }
  if (userConfig.sandbox) {
    config = { ...config, sandbox: deepMerge(config.sandbox, userConfig.sandbox) };
  }
  if (userConfig.plugins) {
    config = { ...config, plugins: deepMerge(config.plugins, userConfig.plugins) };
  }
  if (userConfig.memory) {
    config = { ...config, memory: deepMerge(config.memory!, userConfig.memory) };
  }
  if (userConfig.skills) {
    config = { ...config, skills: userConfig.skills as ClothosConfig['skills'] };
  }

  // Apply channels (flat → { adaptors: { ... } })
  if (userConfig.channels) {
    const adaptors: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(userConfig.channels)) {
      adaptors[key] = { enabled: false, ...value };
    }
    config.channels = { adaptors } as ChannelsConfig;
  }

  // Apply orchestrator overrides
  if (userConfig.orchestrator) {
    config = { ...config, orchestrator: deepMerge(config.orchestrator ?? {}, userConfig.orchestrator) };
  }

  return config;
}

/**
 * Detect whether a parsed config object is a UserConfig (sparse/new format)
 * or a legacy ClothosConfig (full/old format).
 *
 * Heuristics:
 * - If `llm` key is present → UserConfig
 * - If `agents` is an array → UserConfig (legacy uses { defaults, list })
 * - If `agents` is an object with `defaults` → legacy
 * - No agents at all → UserConfig (will get defaults)
 */
export function isUserConfig(parsed: Record<string, unknown>): boolean {
  if ('llm' in parsed) return true;
  if (Array.isArray(parsed['agents'])) return true;
  if (isRecord(parsed['agents']) && 'defaults' in parsed['agents']) return false;
  if (!('agents' in parsed)) return true;
  return false;
}
