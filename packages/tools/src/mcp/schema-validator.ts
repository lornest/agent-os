/** A single validation error with location and description. */
export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
}

/** Result of validating tool arguments against a JSON Schema. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Known JSON Schema type strings. */
type SchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

/**
 * Lightweight JSON Schema validator for MCP tool arguments.
 * Checks required fields and basic type constraints from the schema's
 * `properties` and `required` declarations.
 */
export function validateToolArgs(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check required fields
  const required = schema.required as string[] | undefined;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (!(key in args) || args[key] === undefined) {
        errors.push({
          path: key,
          message: `Missing required field: ${key}`,
        });
      }
    }
  }

  // Check property types
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (properties) {
    for (const [key, value] of Object.entries(args)) {
      const propSchema = properties[key];
      if (!propSchema) continue;

      const expectedType = propSchema.type as SchemaType | undefined;
      if (!expectedType) continue;

      if (value === null || value === undefined) continue;

      const typeError = checkType(value, expectedType);
      if (typeError) {
        errors.push({
          path: key,
          message: typeError,
          expected: expectedType,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Check whether a value matches the expected JSON Schema type. */
function checkType(value: unknown, expected: SchemaType): string | null {
  switch (expected) {
    case 'string':
      if (typeof value !== 'string') {
        return `Expected string, got ${typeof value}`;
      }
      return null;

    case 'number':
    case 'integer':
      if (typeof value !== 'number') {
        return `Expected ${expected}, got ${typeof value}`;
      }
      return null;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return `Expected boolean, got ${typeof value}`;
      }
      return null;

    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        return `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`;
      }
      return null;

    case 'array':
      if (!Array.isArray(value)) {
        return `Expected array, got ${typeof value}`;
      }
      return null;

    default:
      return null;
  }
}

/**
 * Format validation errors into a readable string suitable for LLM self-correction.
 * Includes the schema's properties and required fields as hints.
 */
export function formatValidationErrors(
  errors: ValidationError[],
  schema: Record<string, unknown>,
): string {
  const lines: string[] = ['Argument validation failed:'];

  for (const err of errors) {
    const suffix = err.expected ? ` (expected: ${err.expected})` : '';
    lines.push(`  - ${err.path}: ${err.message}${suffix}`);
  }

  // Append schema hints
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = schema.required as string[] | undefined;

  if (properties) {
    lines.push('');
    lines.push('Schema properties:');
    for (const [name, prop] of Object.entries(properties)) {
      const type = (prop.type as string) ?? 'unknown';
      const desc = (prop.description as string) ?? '';
      const reqMark = required?.includes(name) ? ' (required)' : '';
      lines.push(`  - ${name}: ${type}${reqMark}${desc ? ` — ${desc}` : ''}`);
    }
  }

  if (required && required.length > 0) {
    lines.push('');
    lines.push(`Required fields: ${required.join(', ')}`);
  }

  return lines.join('\n');
}
