import { describe, it, expect } from 'vitest';
import { SessionStore } from '../src/session-store.js';
import { SessionCorruptError } from '../src/errors.js';
import { createMemoryFs } from './helpers.js';

describe('SessionStore', () => {
  it('creates a session and writes header', async () => {
    const fs = createMemoryFs();
    const store = new SessionStore('/sessions', fs);

    const sessionId = await store.createSession('agent-1', 'slack');

    expect(sessionId).toBeTruthy();
    const header = await store.getHeader('agent-1', sessionId);
    expect(header.type).toBe('session_header');
    expect(header.agentId).toBe('agent-1');
    expect(header.channel).toBe('slack');
  });

  it('appends entries and retrieves history', async () => {
    const fs = createMemoryFs();
    const store = new SessionStore('/sessions', fs);

    const sessionId = await store.createSession('agent-1');

    await store.appendEntry('agent-1', sessionId, {
      role: 'user',
      content: 'Hello',
    });
    await store.appendEntry('agent-1', sessionId, {
      role: 'assistant',
      content: 'Hi there!',
    });

    const history = await store.getHistory('agent-1', sessionId);
    expect(history).toHaveLength(2);
    expect(history[0]!.role).toBe('user');
    expect(history[0]!.content).toBe('Hello');
    expect(history[1]!.role).toBe('assistant');
    expect(history[1]!.content).toBe('Hi there!');
  });

  it('forks a session', async () => {
    const fs = createMemoryFs();
    const store = new SessionStore('/sessions', fs);

    const sessionId = await store.createSession('agent-1');
    const e1 = await store.appendEntry('agent-1', sessionId, {
      role: 'user',
      content: 'Hello',
    });
    await store.appendEntry('agent-1', sessionId, {
      role: 'assistant',
      content: 'Hi',
    });
    await store.appendEntry('agent-1', sessionId, {
      role: 'user',
      content: 'More',
    });

    // Fork up to first entry only
    const forkedId = await store.forkSession('agent-1', sessionId, e1);

    const history = await store.getHistory('agent-1', forkedId);
    expect(history).toHaveLength(1);
    expect(history[0]!.content).toBe('Hello');
  });

  it('lists sessions', async () => {
    const fs = createMemoryFs();
    const store = new SessionStore('/sessions', fs);

    const s1 = await store.createSession('agent-1');
    const s2 = await store.createSession('agent-1');

    const sessions = await store.listSessions('agent-1');
    expect(sessions).toContain(s1);
    expect(sessions).toContain(s2);
    expect(sessions).toHaveLength(2);
  });

  it('returns empty array for nonexistent agent', async () => {
    const fs = createMemoryFs();
    const store = new SessionStore('/sessions', fs);

    const sessions = await store.listSessions('nonexistent');
    expect(sessions).toEqual([]);
  });

  it('throws SessionCorruptError on corrupt file', async () => {
    const fs = createMemoryFs();
    const store = new SessionStore('/sessions', fs);

    // Write invalid JSONL
    await fs.mkdir('/sessions/agent-1');
    await fs.writeFile('/sessions/agent-1/bad.jsonl', 'not valid json\n');

    await expect(store.getHistory('agent-1', 'bad')).rejects.toThrow(
      SessionCorruptError,
    );
  });

  it('throws SessionCorruptError when file does not exist', async () => {
    const fs = createMemoryFs();
    const store = new SessionStore('/sessions', fs);

    await expect(store.getHistory('agent-1', 'missing')).rejects.toThrow(
      SessionCorruptError,
    );
  });
});
