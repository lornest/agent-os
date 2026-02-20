import { describe, it, expect } from 'vitest';
import type { DiscoveredPlugin } from '../src/types.js';
import { resolveDependencyOrder } from '../src/dependency-resolver.js';
import { CyclicDependencyError, PluginDependencyError } from '../src/errors.js';

function makePlugin(
  name: string,
  version = '1.0.0',
  dependencies?: Record<string, string>,
): DiscoveredPlugin {
  return {
    manifest: { name, version, description: `${name} plugin`, dependencies },
    entryPath: `/plugins/${name}/dist/index.js`,
    directory: `/plugins/${name}`,
  };
}

describe('resolveDependencyOrder', () => {
  it('returns empty array for empty input', () => {
    expect(resolveDependencyOrder([])).toEqual([]);
  });

  it('returns single plugin unchanged', () => {
    const plugins = [makePlugin('alpha')];
    const result = resolveDependencyOrder(plugins);
    expect(result).toHaveLength(1);
    expect(result[0]!.manifest.name).toBe('alpha');
  });

  it('resolves plugins with no dependencies in any order', () => {
    const plugins = [makePlugin('alpha'), makePlugin('beta'), makePlugin('gamma')];
    const result = resolveDependencyOrder(plugins);
    expect(result).toHaveLength(3);
    const names = result.map((p) => p.manifest.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
  });

  it('resolves linear dependency chain in correct order', () => {
    const plugins = [
      makePlugin('c', '1.0.0', { b: '^1.0.0' }),
      makePlugin('b', '1.0.0', { a: '^1.0.0' }),
      makePlugin('a', '1.0.0'),
    ];
    const result = resolveDependencyOrder(plugins);
    const names = result.map((p) => p.manifest.name);
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'));
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'));
  });

  it('resolves diamond dependency correctly', () => {
    const plugins = [
      makePlugin('d', '1.0.0', { b: '^1.0.0', c: '^1.0.0' }),
      makePlugin('b', '1.0.0', { a: '^1.0.0' }),
      makePlugin('c', '1.0.0', { a: '^1.0.0' }),
      makePlugin('a', '1.0.0'),
    ];
    const result = resolveDependencyOrder(plugins);
    const names = result.map((p) => p.manifest.name);
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'));
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'));
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('d'));
    expect(names.indexOf('c')).toBeLessThan(names.indexOf('d'));
  });

  it('throws CyclicDependencyError on circular dependencies', () => {
    const plugins = [
      makePlugin('a', '1.0.0', { b: '^1.0.0' }),
      makePlugin('b', '1.0.0', { a: '^1.0.0' }),
    ];
    expect(() => resolveDependencyOrder(plugins)).toThrow(CyclicDependencyError);
  });

  it('throws PluginDependencyError for missing dependency', () => {
    const plugins = [makePlugin('a', '1.0.0', { missing: '^1.0.0' })];
    expect(() => resolveDependencyOrder(plugins)).toThrow(PluginDependencyError);
    expect(() => resolveDependencyOrder(plugins)).toThrow(/not available/);
  });

  it('throws PluginDependencyError for semver mismatch', () => {
    const plugins = [
      makePlugin('a', '1.0.0', { b: '^2.0.0' }),
      makePlugin('b', '1.5.0'),
    ];
    expect(() => resolveDependencyOrder(plugins)).toThrow(PluginDependencyError);
    expect(() => resolveDependencyOrder(plugins)).toThrow(/requires/);
  });

  it('accepts valid semver ranges', () => {
    const plugins = [
      makePlugin('a', '1.0.0', { b: '^1.0.0' }),
      makePlugin('b', '1.5.3'),
    ];
    const result = resolveDependencyOrder(plugins);
    const names = result.map((p) => p.manifest.name);
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('a'));
  });

  it('detects three-node cycle', () => {
    const plugins = [
      makePlugin('a', '1.0.0', { c: '^1.0.0' }),
      makePlugin('b', '1.0.0', { a: '^1.0.0' }),
      makePlugin('c', '1.0.0', { b: '^1.0.0' }),
    ];
    expect(() => resolveDependencyOrder(plugins)).toThrow(CyclicDependencyError);
  });

  it('cycle error includes participating plugins', () => {
    const plugins = [
      makePlugin('x', '1.0.0', { y: '^1.0.0' }),
      makePlugin('y', '1.0.0', { x: '^1.0.0' }),
    ];
    try {
      resolveDependencyOrder(plugins);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CyclicDependencyError);
      const cycleErr = err as CyclicDependencyError;
      expect(cycleErr.cycle).toContain('x');
      expect(cycleErr.cycle).toContain('y');
    }
  });
});
