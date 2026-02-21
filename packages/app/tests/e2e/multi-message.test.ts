import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AppHarness } from './helpers/app-harness.js';

describe('E2E: Multi-message agent responses', () => {
  const harness = new AppHarness();

  beforeAll(async () => {
    // Mock LLM responses:
    // 1st call: tool call → yields assistant_message #1
    // 2nd call: final text → yields assistant_message #2
    // Both should arrive at the WS client, followed by task.done
    await harness.start({
      mockResponses: [
        {
          text: 'Let me read that file for you.',
          toolCalls: [
            {
              id: 'tc-1',
              name: 'read_file',
              arguments: JSON.stringify({ path: 'data.txt' }),
            },
          ],
        },
        {
          text: 'The file says: hello world',
        },
      ],
    });

    // Create a file in the agent's workspace
    const workspaceDir = path.join(
      harness.basePath,
      'agents',
      harness.agentId,
      'workspace',
    );
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, 'data.txt'),
      'hello world',
      'utf-8',
    );
  }, 15_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('receives all assistant messages and a task.done signal', async () => {
    const correlationId = harness.client.sendToAgent(
      harness.agentId,
      'Read data.txt',
    );

    const responses = await harness.client.waitForAllResponses(
      correlationId,
      10_000,
    );

    // Should have received at least 2 assistant messages
    expect(responses.length).toBeGreaterThanOrEqual(2);

    // All should be task.response type
    for (const r of responses) {
      expect(r.type).toBe('task.response');
      expect(r.correlationId).toBe(correlationId);
    }

    // Should contain the tool-call turn text and the final response
    const texts = responses.map((r) => (r.data as { text: string }).text);
    expect(texts).toContain('Let me read that file for you.');
    expect(texts.some((t) => t.includes('hello world'))).toBe(true);
  }, 15_000);

  it('called the LLM twice (tool call turn + final turn)', () => {
    expect(harness.mock.callCount).toBe(2);
  });
});
