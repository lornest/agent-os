import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppHarness } from './helpers/app-harness.js';

describe('E2E: Session continuity', () => {
  const harness = new AppHarness();
  let callCountBefore: number;

  beforeAll(async () => {
    await harness.start({
      mockResponses: [
        { text: 'Response 1' },
        { text: 'Response 2' },
        { text: 'Response 3' },
      ],
    });
    callCountBefore = 0;
  }, 15_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('sends 3 messages and receives 3 responses in sequence', async () => {
    // Message 1
    const c1 = harness.client.sendToAgent('test-agent', 'Message 1');
    const r1 = await harness.client.waitForResponse(c1, 10_000);
    expect((r1.data as { text: string }).text).toBe('Response 1');

    // Message 2
    const c2 = harness.client.sendToAgent('test-agent', 'Message 2');
    const r2 = await harness.client.waitForResponse(c2, 10_000);
    expect((r2.data as { text: string }).text).toBe('Response 2');

    // Message 3
    const c3 = harness.client.sendToAgent('test-agent', 'Message 3');
    const r3 = await harness.client.waitForResponse(c3, 10_000);
    expect((r3.data as { text: string }).text).toBe('Response 3');

    // All 3 LLM calls were made
    expect(harness.mock.callCount).toBe(3);
  }, 30_000);
});
