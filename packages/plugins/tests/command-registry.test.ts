import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../src/command-registry.js';

describe('CommandRegistry', () => {
  it('registers and executes a command', async () => {
    const registry = new CommandRegistry();
    registry.register('hello', (args) => `Hello, ${args}!`);
    const result = await registry.execute('hello', 'world');
    expect(result).toBe('Hello, world!');
  });

  it('throws on unknown command', async () => {
    const registry = new CommandRegistry();
    await expect(registry.execute('missing', '')).rejects.toThrow('Unknown command: "missing"');
  });

  it('dispose removes the command', async () => {
    const registry = new CommandRegistry();
    const disposable = registry.register('test', () => 'ok');
    expect(registry.has('test')).toBe(true);

    disposable.dispose();
    expect(registry.has('test')).toBe(false);
  });

  it('getAll returns all registered command names', () => {
    const registry = new CommandRegistry();
    registry.register('alpha', () => {});
    registry.register('beta', () => {});
    expect(registry.getAll()).toEqual(['alpha', 'beta']);
  });

  it('clear removes all commands', () => {
    const registry = new CommandRegistry();
    registry.register('a', () => {});
    registry.register('b', () => {});
    registry.clear();
    expect(registry.getAll()).toEqual([]);
  });

  it('supports async command handlers', async () => {
    const registry = new CommandRegistry();
    registry.register('slow', async (args) => {
      return `async: ${args}`;
    });
    const result = await registry.execute('slow', 'test');
    expect(result).toBe('async: test');
  });
});
