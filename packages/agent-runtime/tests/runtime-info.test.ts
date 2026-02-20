import { describe, it, expect } from 'vitest';
import { collectRuntimeInfo, formatRuntimeInfo } from '../src/runtime-info.js';

describe('collectRuntimeInfo', () => {
  it('returns runtime info with correct fields', () => {
    const info = collectRuntimeInfo({
      model: 'gpt-4',
      repoRoot: '/home/user/project',
      agentId: 'agent-1',
      agentName: 'Test Agent',
    });

    expect(info.os).toBe(process.platform);
    expect(info.model).toBe('gpt-4');
    expect(info.repoRoot).toBe('/home/user/project');
    expect(info.agentId).toBe('agent-1');
    expect(info.agentName).toBe('Test Agent');
    expect(typeof info.timezone).toBe('string');
    expect(info.timezone.length).toBeGreaterThan(0);
  });

  it('timezone is a static string, not a timestamp', () => {
    const info = collectRuntimeInfo({
      model: 'test',
      repoRoot: '/test',
      agentId: 'a',
      agentName: 'A',
    });

    // Timezone should be something like "America/New_York", not a number
    expect(info.timezone).toMatch(/^[A-Za-z]/);
    expect(Number.isNaN(Number(info.timezone))).toBe(true);
  });
});

describe('formatRuntimeInfo', () => {
  it('formats as XML runtime-info section', () => {
    const info = {
      os: 'linux',
      model: 'gpt-4',
      timezone: 'America/New_York',
      repoRoot: '/project',
      agentId: 'agent-1',
      agentName: 'Test Agent',
    };

    const result = formatRuntimeInfo(info);
    expect(result).toContain('<runtime-info>');
    expect(result).toContain('</runtime-info>');
    expect(result).toContain('os: linux');
    expect(result).toContain('model: gpt-4');
    expect(result).toContain('timezone: America/New_York');
    expect(result).toContain('repo-root: /project');
    expect(result).toContain('agent-id: agent-1');
    expect(result).toContain('agent-name: Test Agent');
  });
});
