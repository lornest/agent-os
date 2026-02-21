import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppHarness } from './helpers/app-harness.js';

describe('E2E: Health check', () => {
  const harness = new AppHarness();

  beforeAll(async () => {
    await harness.start();
  }, 15_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('WebSocket client is connected', () => {
    expect(harness.client.isConnected).toBe(true);
  });

  it('server has agents wired', () => {
    expect(harness.server.agents.size).toBe(1);
    expect(harness.server.agents.has(harness.agentId)).toBe(true);
  });

  it('agent is in READY state', () => {
    const wired = harness.server.agents.get(harness.agentId)!;
    expect(wired.manager.getStatus()).toBe('READY');
  });
});
