import JSON5 from 'json5';
import { readFileSync } from 'node:fs';
import type { ClothosConfig } from './config.js';
import type { UserConfig } from './user-config.js';
import { isRecord } from './utils.js';
import { applyEnvOverrides } from './config-env-overlay.js';
import { resolveConfig, isUserConfig } from './config-transform.js';

/** Sections that must exist in a legacy full config. */
const LEGACY_REQUIRED_SECTIONS = [
  'gateway',
  'agents',
  'bindings',
  'models',
  'auth',
  'session',
  'tools',
  'sandbox',
  'plugins',
] as const;

/** All valid top-level keys (legacy + new). */
const VALID_TOP_LEVEL_KEYS = new Set<string>([
  ...LEGACY_REQUIRED_SECTIONS,
  'memory', 'skills', 'channels', 'orchestrator',
  'llm', // New simplified LLM config
]);

export interface ConfigValidationError {
  path: string;
  message: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  config?: ClothosConfig;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

/**
 * Validate a sparse UserConfig.
 * Only requires agents with id and name. Everything else is optional.
 */
export function validateUserConfig(parsed: Record<string, unknown>): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  // Check for unknown top-level keys
  for (const key of Object.keys(parsed)) {
    if (!VALID_TOP_LEVEL_KEYS.has(key)) {
      errors.push({ path: key, message: `Unknown top-level key: "${key}"` });
    }
  }

  // Agents must be an array (if present)
  const agents = parsed['agents'];
  if (agents !== undefined) {
    if (!isArray(agents)) {
      errors.push({ path: 'agents', message: 'Expected array of agent entries' });
    } else {
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (!isRecord(agent)) {
          errors.push({ path: `agents[${i}]`, message: 'Expected object' });
          continue;
        }
        if (!isString(agent['id']) || (agent['id'] as string).trim() === '') {
          errors.push({ path: `agents[${i}].id`, message: 'Required non-empty string' });
        }
        if (!isString(agent['name']) || (agent['name'] as string).trim() === '') {
          errors.push({ path: `agents[${i}].name`, message: 'Required non-empty string' });
        }
      }
    }
  }

  // Validate llm section if present
  const llm = parsed['llm'];
  if (llm !== undefined) {
    if (!isRecord(llm)) {
      errors.push({ path: 'llm', message: 'Expected object' });
    } else {
      if (llm['provider'] !== undefined && !isString(llm['provider'])) {
        errors.push({ path: 'llm.provider', message: 'Expected string' });
      }
      if (llm['model'] !== undefined && !isString(llm['model'])) {
        errors.push({ path: 'llm.model', message: 'Expected string' });
      }

      // Validate additional providers
      const providers = llm['providers'];
      if (providers !== undefined) {
        if (!isArray(providers)) {
          errors.push({ path: 'llm.providers', message: 'Expected array' });
        } else {
          const seenIds = new Set<string>();
          for (let i = 0; i < providers.length; i++) {
            const entry = providers[i];
            if (!isRecord(entry)) {
              errors.push({ path: `llm.providers[${i}]`, message: 'Expected object' });
              continue;
            }
            if (!isString(entry['id']) || (entry['id'] as string).trim() === '') {
              errors.push({ path: `llm.providers[${i}].id`, message: 'Required non-empty string' });
            } else if (seenIds.has(entry['id'] as string)) {
              errors.push({ path: `llm.providers[${i}].id`, message: `Duplicate provider ID: "${entry['id']}"` });
            } else {
              seenIds.add(entry['id'] as string);
            }
            if (!isString(entry['provider']) || (entry['provider'] as string).trim() === '') {
              errors.push({ path: `llm.providers[${i}].provider`, message: 'Required non-empty string' });
            }
            if (!isString(entry['model']) || (entry['model'] as string).trim() === '') {
              errors.push({ path: `llm.providers[${i}].model`, message: 'Required non-empty string' });
            }
          }

          // Validate fallbacks reference existing provider IDs
          const fallbacks = llm['fallbacks'];
          if (fallbacks !== undefined) {
            if (!isArray(fallbacks)) {
              errors.push({ path: 'llm.fallbacks', message: 'Expected array' });
            } else {
              const validIds = new Set(['pi-mono', ...seenIds]);
              for (let i = 0; i < fallbacks.length; i++) {
                if (!isString(fallbacks[i])) {
                  errors.push({ path: `llm.fallbacks[${i}]`, message: 'Expected string' });
                } else if (!validIds.has(fallbacks[i] as string)) {
                  errors.push({ path: `llm.fallbacks[${i}]`, message: `Unknown provider ID: "${fallbacks[i]}"` });
                }
              }
            }
          }
        }
      }
    }
  }

  // Validate bindings if present
  if (parsed['bindings'] !== undefined && !isArray(parsed['bindings'])) {
    errors.push({ path: 'bindings', message: 'Expected array' });
  }

  return errors;
}

/**
 * Validate a legacy full ClothosConfig.
 * Checks all required sections and critical fields.
 */
function validateLegacyConfig(parsed: Record<string, unknown>): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  // Check for unknown top-level keys
  for (const key of Object.keys(parsed)) {
    if (!VALID_TOP_LEVEL_KEYS.has(key)) {
      errors.push({ path: key, message: `Unknown top-level key: "${key}"` });
    }
  }

  // Check for required sections
  for (const section of LEGACY_REQUIRED_SECTIONS) {
    if (!(section in parsed)) {
      errors.push({ path: section, message: `Missing required section: "${section}"` });
    } else if (!isRecord(parsed[section]) && !Array.isArray(parsed[section])) {
      errors.push({ path: section, message: `Section "${section}" must be an object or array` });
    }
  }

  const root = parsed;

  // Gateway validation
  const gateway = root['gateway'];
  if (isRecord(gateway)) {
    if (!isRecord(gateway['nats']) || !isString((gateway['nats'] as Record<string, unknown>)['url'])) {
      errors.push({ path: 'gateway.nats.url', message: 'Expected string URL' });
    }
    if (!isRecord(gateway['redis']) || !isString((gateway['redis'] as Record<string, unknown>)['url'])) {
      errors.push({ path: 'gateway.redis.url', message: 'Expected string URL' });
    }
    const websocket = gateway['websocket'];
    if (!isRecord(websocket)) {
      errors.push({ path: 'gateway.websocket', message: 'Expected object' });
    } else {
      if (!isNumber(websocket['port'])) {
        errors.push({ path: 'gateway.websocket.port', message: 'Expected number' });
      }
      if (websocket['allowAnonymous'] !== undefined && !isBoolean(websocket['allowAnonymous'])) {
        errors.push({ path: 'gateway.websocket.allowAnonymous', message: 'Expected boolean' });
      }
      if (websocket['sharedSecret'] !== undefined && !isString(websocket['sharedSecret'])) {
        errors.push({ path: 'gateway.websocket.sharedSecret', message: 'Expected string' });
      }
      if (websocket['jwtSecret'] !== undefined && !isString(websocket['jwtSecret'])) {
        errors.push({ path: 'gateway.websocket.jwtSecret', message: 'Expected string' });
      }
      if (websocket['tokenExpiryMs'] !== undefined && !isNumber(websocket['tokenExpiryMs'])) {
        errors.push({ path: 'gateway.websocket.tokenExpiryMs', message: 'Expected number' });
      }
      if (websocket['responseTtlMs'] !== undefined && !isNumber(websocket['responseTtlMs'])) {
        errors.push({ path: 'gateway.websocket.responseTtlMs', message: 'Expected number' });
      }
    }
    if (!isNumber(gateway['maxConcurrentAgents'])) {
      errors.push({ path: 'gateway.maxConcurrentAgents', message: 'Expected number' });
    }
  }

  // Agents validation (legacy format: { defaults, list })
  const agents = root['agents'];
  if (isRecord(agents)) {
    const defaults = agents['defaults'];
    if (!isRecord(defaults)) {
      errors.push({ path: 'agents.defaults', message: 'Expected object' });
    } else {
      if (!isString(defaults['model'])) errors.push({ path: 'agents.defaults.model', message: 'Expected string' });
      if (!isNumber(defaults['contextWindow'])) errors.push({ path: 'agents.defaults.contextWindow', message: 'Expected number' });
      if (!isNumber(defaults['maxTurns'])) errors.push({ path: 'agents.defaults.maxTurns', message: 'Expected number' });
    }
    if (!isArray(agents['list'])) {
      errors.push({ path: 'agents.list', message: 'Expected array' });
    }
  }

  if (root['bindings'] !== undefined && !isArray(root['bindings'])) {
    errors.push({ path: 'bindings', message: 'Expected array' });
  }

  // Models + auth validation (with referential integrity)
  const models = root['models'];
  const auth = root['auth'];

  // Collect auth profile IDs for cross-referencing
  const authProfileIds = new Set<string>();
  if (isRecord(auth)) {
    if (!isArray(auth['profiles'])) {
      errors.push({ path: 'auth.profiles', message: 'Expected array' });
    } else {
      for (const profile of auth['profiles']) {
        if (isRecord(profile) && isString(profile['id'])) {
          authProfileIds.add(profile['id'] as string);
        }
      }
    }
  }

  if (isRecord(models)) {
    if (!isArray(models['providers'])) {
      errors.push({ path: 'models.providers', message: 'Expected array' });
    } else {
      // Collect provider IDs and validate profile references
      const providerIds = new Set<string>();
      for (let i = 0; i < models['providers'].length; i++) {
        const mp = models['providers'][i];
        if (isRecord(mp)) {
          if (isString(mp['id'])) providerIds.add(mp['id'] as string);
          // Check that referenced profiles exist in auth.profiles
          if (isArray(mp['profiles'])) {
            for (const profileRef of mp['profiles'] as unknown[]) {
              if (isString(profileRef) && authProfileIds.size > 0 && !authProfileIds.has(profileRef)) {
                errors.push({
                  path: `models.providers[${i}].profiles`,
                  message: `Referenced auth profile "${profileRef}" not found in auth.profiles`,
                });
              }
            }
          }
        }
      }

      // Validate fallback references
      if (!isArray(models['fallbacks'])) {
        errors.push({ path: 'models.fallbacks', message: 'Expected array' });
      } else {
        for (let i = 0; i < models['fallbacks'].length; i++) {
          const fid = models['fallbacks'][i];
          if (isString(fid) && providerIds.size > 0 && !providerIds.has(fid as string)) {
            errors.push({
              path: `models.fallbacks[${i}]`,
              message: `Referenced provider ID "${fid}" not found in models.providers`,
            });
          }
        }
      }
    }
  }

  // Session validation
  const session = root['session'];
  if (isRecord(session)) {
    const compaction = session['compaction'];
    if (!isRecord(compaction)) {
      errors.push({ path: 'session.compaction', message: 'Expected object' });
    } else {
      if (!isBoolean(compaction['enabled'])) errors.push({ path: 'session.compaction.enabled', message: 'Expected boolean' });
      if (!isNumber(compaction['reserveTokens'])) errors.push({ path: 'session.compaction.reserveTokens', message: 'Expected number' });
    }
  }

  // Tools validation
  const tools = root['tools'];
  if (isRecord(tools)) {
    if (tools['allow'] !== undefined && !isArray(tools['allow'])) errors.push({ path: 'tools.allow', message: 'Expected array' });
    if (tools['deny'] !== undefined && !isArray(tools['deny'])) errors.push({ path: 'tools.deny', message: 'Expected array' });
  }

  // Sandbox validation
  const sandbox = root['sandbox'];
  if (isRecord(sandbox)) {
    if (!isString(sandbox['mode'])) errors.push({ path: 'sandbox.mode', message: 'Expected string' });
    if (!isString(sandbox['scope'])) errors.push({ path: 'sandbox.scope', message: 'Expected string' });
    const docker = sandbox['docker'];
    if (!isRecord(docker)) {
      errors.push({ path: 'sandbox.docker', message: 'Expected object' });
    } else if (!isString(docker['image'])) {
      errors.push({ path: 'sandbox.docker.image', message: 'Expected string' });
    }
  }

  // Plugins validation
  const plugins = root['plugins'];
  if (isRecord(plugins)) {
    if (!isArray(plugins['directories'])) errors.push({ path: 'plugins.directories', message: 'Expected array' });
    if (!isArray(plugins['enabled'])) errors.push({ path: 'plugins.enabled', message: 'Expected array' });
    if (!isArray(plugins['disabled'])) errors.push({ path: 'plugins.disabled', message: 'Expected array' });
  }

  return errors;
}

/**
 * Parse and validate a JSON5 config string.
 * Auto-detects whether it's a sparse UserConfig or a legacy full ClothosConfig.
 *
 * For UserConfig: validates sparse structure, merges with defaults, transforms to ClothosConfig.
 * For legacy: validates all required sections as before.
 */
export function validateConfig(json5String: string): ConfigValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON5.parse(json5String);
  } catch (err) {
    return {
      valid: false,
      errors: [{ path: '', message: `Invalid JSON5: ${String(err)}` }],
    };
  }

  if (!isRecord(parsed)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Config must be an object' }],
    };
  }

  if (isUserConfig(parsed)) {
    // Sparse UserConfig path
    const errors = validateUserConfig(parsed);
    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Apply env overlays to UserConfig (catches CLOTHOS_LLM__* etc.)
    const withEnv = applyEnvOverrides(parsed as Record<string, unknown>);

    // Transform to full ClothosConfig
    const config = resolveConfig(withEnv as unknown as UserConfig);

    return { valid: true, errors: [], config };
  }

  // Legacy full ClothosConfig path
  const errors = validateLegacyConfig(parsed);
  return {
    valid: errors.length === 0,
    errors,
    config: errors.length === 0 ? (parsed as unknown as ClothosConfig) : undefined,
  };
}

/**
 * Load and validate a JSON5 config file from disk.
 * Supports both sparse UserConfig and legacy full ClothosConfig formats.
 */
export function loadConfig(filePath: string): ConfigValidationResult {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      valid: false,
      errors: [{ path: '', message: `Cannot read config file: ${String(err)}` }],
    };
  }
  return validateConfig(content);
}
