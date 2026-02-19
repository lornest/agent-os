import { describe, it, expect } from 'vitest';
import { HookRegistry } from '../src/hook-registry.js';
import { HookBlockError } from '../src/errors.js';

describe('HookRegistry', () => {
  it('fires handlers in priority order', async () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    registry.register('turn_start', async () => {
      order.push(2);
    }, 200);
    registry.register('turn_start', async () => {
      order.push(1);
    }, 100);
    registry.register('turn_start', async () => {
      order.push(3);
    }, 300);

    await registry.fire('turn_start', {});
    expect(order).toEqual([1, 2, 3]);
  });

  it('chains handler results (each receives previous output)', async () => {
    const registry = new HookRegistry();

    registry.register('context_assemble', async (ctx) => {
      return { ...(ctx as Record<string, unknown>), a: 1 };
    }, 1);
    registry.register('context_assemble', async (ctx) => {
      return { ...(ctx as Record<string, unknown>), b: 2 };
    }, 2);

    const result = await registry.fire('context_assemble', {});
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('dispose removes a handler', async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    const disposable = registry.register('turn_start', async () => {
      calls.push('a');
    });
    registry.register('turn_start', async () => {
      calls.push('b');
    });

    expect(registry.handlerCount('turn_start')).toBe(2);
    disposable.dispose();
    expect(registry.handlerCount('turn_start')).toBe(1);

    await registry.fire('turn_start', {});
    expect(calls).toEqual(['b']);
  });

  it('propagates HookBlockError', async () => {
    const registry = new HookRegistry();

    registry.register('tool_call', async () => {
      throw new HookBlockError('dangerous tool');
    });

    await expect(registry.fire('tool_call', {})).rejects.toThrow(HookBlockError);
    await expect(registry.fire('tool_call', {})).rejects.toThrow('dangerous tool');
  });

  it('clearAll removes all handlers', async () => {
    const registry = new HookRegistry();

    registry.register('turn_start', async () => {});
    registry.register('turn_end', async () => {});

    expect(registry.handlerCount('turn_start')).toBe(1);
    expect(registry.handlerCount('turn_end')).toBe(1);

    registry.clearAll();

    expect(registry.handlerCount('turn_start')).toBe(0);
    expect(registry.handlerCount('turn_end')).toBe(0);
  });

  it('returns context unchanged when no handlers registered', async () => {
    const registry = new HookRegistry();
    const ctx = { foo: 'bar' };
    const result = await registry.fire('turn_start', ctx);
    expect(result).toBe(ctx);
  });

  it('clear removes handlers for a specific event', async () => {
    const registry = new HookRegistry();

    registry.register('turn_start', async () => {});
    registry.register('turn_end', async () => {});

    registry.clear('turn_start');

    expect(registry.handlerCount('turn_start')).toBe(0);
    expect(registry.handlerCount('turn_end')).toBe(1);
  });
});
