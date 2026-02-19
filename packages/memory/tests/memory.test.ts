import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

describe('memory', () => {
  it('exports package name', () => {
    expect(PACKAGE_NAME).toBe('@agentic-os/memory');
  });
});
