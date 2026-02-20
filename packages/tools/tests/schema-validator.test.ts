import { describe, it, expect } from 'vitest';
import { validateToolArgs, formatValidationErrors } from '../src/mcp/schema-validator.js';

const exampleSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The name' },
    count: { type: 'number', description: 'A count value' },
    enabled: { type: 'boolean', description: 'Toggle flag' },
  },
  required: ['name', 'count'],
};

describe('validateToolArgs', () => {
  // ── Valid args ──────────────────────────────────────────────────────

  it('passes validation for valid arguments', () => {
    const result = validateToolArgs(
      { name: 'test', count: 42, enabled: true },
      exampleSchema,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ── Missing required field ─────────────────────────────────────────

  it('fails when a required field is missing', () => {
    const result = validateToolArgs({ name: 'test' }, exampleSchema);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe('count');
    expect(result.errors[0]!.message).toContain('Missing required field');
  });

  // ── Wrong type ─────────────────────────────────────────────────────

  it('fails when a field has the wrong type (string where number expected)', () => {
    const result = validateToolArgs(
      { name: 'test', count: 'not-a-number' },
      exampleSchema,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe('count');
    expect(result.errors[0]!.message).toContain('Expected number');
    expect(result.errors[0]!.expected).toBe('number');
  });

  // ── Extra fields pass (no strict mode) ─────────────────────────────

  it('allows unknown extra fields without error', () => {
    const result = validateToolArgs(
      { name: 'test', count: 5, extraField: 'ignored' },
      exampleSchema,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ── Multiple errors collected ──────────────────────────────────────

  it('collects multiple errors', () => {
    const result = validateToolArgs(
      { count: 'wrong-type' },
      exampleSchema,
    );

    expect(result.valid).toBe(false);
    // Missing 'name', missing 'count', wrong type on 'count'
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('name');
    expect(paths).toContain('count');
  });
});

describe('formatValidationErrors', () => {
  it('includes schema hints in the formatted output', () => {
    const result = validateToolArgs({ count: 'bad' }, exampleSchema);
    const formatted = formatValidationErrors(result.errors, exampleSchema);

    // Should contain the header
    expect(formatted).toContain('Argument validation failed');

    // Should contain error messages
    expect(formatted).toContain('name');
    expect(formatted).toContain('count');

    // Should contain schema hints section
    expect(formatted).toContain('Schema properties');
    expect(formatted).toContain('string');
    expect(formatted).toContain('number');

    // Should contain required fields section
    expect(formatted).toContain('Required fields');
    expect(formatted).toContain('name');
    expect(formatted).toContain('count');
  });
});
