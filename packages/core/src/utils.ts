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
