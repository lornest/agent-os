import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppHarness } from './helpers/app-harness.js';

describe('E2E: Conversation round-trip', () => {
  const harness = new AppHarness();

  beforeAll(async () => {
    await harness.start({
      mockResponses: [{ text: 'Hello! I am the test agent.' }],
    });
  }, 15_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('sends a message and receives a response via WebSocket', async () => {
    const correlationId = harness.client.sendToAgent('test-agent', 'Hello!');
    const response = await harness.client.waitForResponse(correlationId, 10_000);

    expect(response).toBeDefined();
    expect(response.type).toBe('task.response');
    expect(response.correlationId).toBe(correlationId);
    expect(response.source).toBe('agent://test-agent');

    const data = response.data as { text: string };
    expect(data.text).toBe('Hello! I am the test agent.');
  }, 15_000);

  it('confirms the LLM was called', () => {
    expect(harness.mock.callCount).toBeGreaterThanOrEqual(1);
  });
});
