import JSON5 from 'json5';
import { readFileSync } from 'node:fs';
import type { AgenticOsConfig } from './config.js';
import { isRecord } from './utils.js';

/** Sections that must exist at the top level of the config. */
const REQUIRED_SECTIONS = [
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

/** All valid top-level keys (required + optional). */
const VALID_TOP_LEVEL_KEYS = new Set<string>([...REQUIRED_SECTIONS, 'memory', 'skills', 'channels']);

export interface ConfigValidationError {
  path: string;
  message: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  config?: AgenticOsConfig;
}

/**
 * Parse and validate a JSON5 config string.
 * Rejects unknown top-level keys (strict mode).
 */
export function validateConfig(json5String: string): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];

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

  // Check for unknown top-level keys (strict mode)
  for (const key of Object.keys(parsed)) {
    if (!VALID_TOP_LEVEL_KEYS.has(key)) {
      errors.push({ path: key, message: `Unknown top-level key: "${key}"` });
    }
  }

  // Check for required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!(section in parsed)) {
      errors.push({ path: section, message: `Missing required section: "${section}"` });
    } else if (!isRecord(parsed[section]) && !Array.isArray(parsed[section])) {
      errors.push({
        path: section,
        message: `Section "${section}" must be an object or array`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    config: errors.length === 0 ? (parsed as unknown as AgenticOsConfig) : undefined,
  };
}

/**
 * Load and validate a JSON5 config file from disk.
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
