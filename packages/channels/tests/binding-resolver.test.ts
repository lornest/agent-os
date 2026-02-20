import { describe, it, expect } from 'vitest';
import type { Binding } from '@agentic-os/core';
import { resolveAgent } from '../src/binding-resolver.js';

const bindings: Binding[] = [
  { channel: 'default', agentId: 'default-agent' },
  { channel: 'webchat', agentId: 'webchat-agent' },
  { channel: 'webchat', peer: 'alice', agentId: 'alice-agent' },
  { channel: 'webchat', team: 'team-1', agentId: 'team1-agent' },
  { peer: 'bob', agentId: 'bob-agent' },
];

describe('resolveAgent', () => {
  it('resolves to channel-specific binding', () => {
    expect(resolveAgent(bindings, 'webchat', 'random-user')).toBe('webchat-agent');
  });

  it('resolves peer match with highest priority', () => {
    expect(resolveAgent(bindings, 'webchat', 'alice')).toBe('alice-agent');
  });

  it('resolves team match', () => {
    expect(resolveAgent(bindings, 'webchat', 'random-user', 'team-1')).toBe('team1-agent');
  });

  it('falls back to default binding for unknown channels', () => {
    expect(resolveAgent(bindings, 'telegram', 'random-user')).toBe('default-agent');
  });

  it('resolves peer-only binding regardless of channel', () => {
    expect(resolveAgent(bindings, 'discord', 'bob')).toBe('bob-agent');
  });

  it('throws when no binding matches and no default', () => {
    const noDefault: Binding[] = [
      { channel: 'webchat', agentId: 'webchat-agent' },
    ];
    expect(() => resolveAgent(noDefault, 'telegram', 'user1')).toThrow(
      'No binding found',
    );
  });

  it('prefers more specific match over less specific', () => {
    // alice matches peer (+4) + channel (+1) = 5, vs channel-only = 1
    expect(resolveAgent(bindings, 'webchat', 'alice')).toBe('alice-agent');
  });

  it('handles empty bindings by throwing', () => {
    expect(() => resolveAgent([], 'webchat', 'user1')).toThrow('No binding found');
  });
});
