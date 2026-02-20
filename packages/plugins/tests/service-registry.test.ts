import { describe, it, expect } from 'vitest';
import { ServiceRegistry } from '../src/service-registry.js';

describe('ServiceRegistry', () => {
  it('registers and retrieves a service', () => {
    const registry = new ServiceRegistry();
    registry.register('db', { host: 'localhost' });
    expect(registry.get<{ host: string }>('db')).toEqual({ host: 'localhost' });
  });

  it('throws on unknown service', () => {
    const registry = new ServiceRegistry();
    expect(() => registry.get('missing')).toThrow('Service "missing" is not registered');
  });

  it('reports presence with has()', () => {
    const registry = new ServiceRegistry();
    expect(registry.has('db')).toBe(false);
    registry.register('db', {});
    expect(registry.has('db')).toBe(true);
  });

  it('allows overwriting a service', () => {
    const registry = new ServiceRegistry();
    registry.register('db', { version: 1 });
    registry.register('db', { version: 2 });
    expect(registry.get<{ version: number }>('db').version).toBe(2);
  });

  it('preserves type information', () => {
    const registry = new ServiceRegistry();
    registry.register<string>('name', 'hello');
    const value: string = registry.get<string>('name');
    expect(value).toBe('hello');
  });
});
