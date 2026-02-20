import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppHarness } from './helpers/app-harness.js';

describe('E2E: Graceful shutdown', () => {
  const harness = new AppHarness();

  beforeAll(async () => {
    await harness.start();
  }, 15_000);

  it('shuts down cleanly and disconnects WS clients', async () => {
    // Verify running first
    expect(harness.client.isConnected).toBe(true);
    expect(harness.server.agents.size).toBe(1);

    // Shut down
    await harness.server.shutdown();

    // Agent should be terminated
    const wired = harness.server.agents.get('test-agent')!;
    expect(wired.manager.getStatus()).toBe('TERMINATED');
  }, 15_000);

  afterAll(async () => {
    // harness.stop() will try to shut down again, but that's OK
    try {
      await harness.stop();
    } catch {
      // Already shut down
    }
  });
});
