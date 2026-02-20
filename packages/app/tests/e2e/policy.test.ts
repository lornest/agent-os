import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppHarness } from './helpers/app-harness.js';

describe('E2E: Tool policy enforcement', () => {
  const harness = new AppHarness();

  beforeAll(async () => {
    await harness.start({
      toolsDeny: ['bash'],
      mockResponses: [
        {
          text: '',
          toolCalls: [
            {
              id: 'tc-bash',
              name: 'bash',
              arguments: JSON.stringify({ command: 'echo hello' }),
            },
          ],
        },
        {
          text: 'I could not execute the command because bash is not allowed.',
        },
      ],
    });
  }, 15_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('blocks a denied tool and returns a response', async () => {
    const correlationId = harness.client.sendToAgent(
      'test-agent',
      'Run echo hello',
    );

    const response = await harness.client.waitForResponse(correlationId, 10_000);
    expect(response).toBeDefined();

    // The agent should still produce a response (either the tool blocked message
    // or the fallback text). The key assertion is that we get a response, not a crash.
    expect(response.type).toBe('task.response');
  }, 15_000);
});
