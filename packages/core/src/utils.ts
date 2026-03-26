import { randomUUID } from 'node:crypto';

/**
 * Generate a UUIDv7 (timestamp-ordered).
 * Falls back to UUIDv4 if the runtime doesn't support v7.
 */
export function generateId(): string {
  // Node 22+ supports randomUUID; use v7 when available
  // For now, use v4 — swap to v7 via a library in a later phase
  return randomUUID();
}

/** Current time as RFC 3339 string. */
export function now(): string {
  return new Date().toISOString();
}

/** Type guard: checks that a value is a non-null object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Makes all properties (and nested properties) optional. */
export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

/**
 * Deep-merge source onto target. Arrays replace (don't concatenate).
 * Returns a new object — does not mutate inputs.
 *
 * The source can be a DeepPartial<T> — only specified fields override.
 */
export function deepMerge<T extends object>(target: T, source: unknown): T {
  if (!isRecord(source)) return target;

  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sourceVal = (source as Record<string, unknown>)[key];
    const targetVal = result[key];

    if (sourceVal === undefined) continue;

    if (isRecord(sourceVal) && isRecord(targetVal)) {
      result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }

  return result as T;
}
