import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AppHarness } from './helpers/app-harness.js';

describe('E2E: Tool execution', () => {
  const harness = new AppHarness();

  beforeAll(async () => {
    // First call: LLM requests read_file tool
    // Second call: LLM responds with the file content
    await harness.start({
      mockResponses: [
        {
          text: '',
          toolCalls: [
            {
              id: 'tc-1',
              name: 'read_file',
              arguments: JSON.stringify({ path: 'hello.txt' }),
            },
          ],
        },
        {
          text: 'The file contains: test file content',
        },
      ],
    });

    // Create a file in the agent's workspace
    const workspaceDir = path.join(harness.basePath, 'agents', harness.agentId, 'workspace');
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(path.join(workspaceDir, 'hello.txt'), 'test file content', 'utf-8');
  }, 15_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('executes a tool call and returns the result', async () => {
    const correlationId = harness.client.sendToAgent(
      harness.agentId,
      'Read the file hello.txt',
    );

    const responses = await harness.client.waitForAllResponses(correlationId, 10_000);

    expect(responses.length).toBeGreaterThanOrEqual(2);

    // All should be task.response type
    for (const r of responses) {
      expect(r.type).toBe('task.response');
    }

    // Final response should contain the file content
    const texts = responses.map((r) => (r.data as { text: string }).text);
    expect(texts.some((t) => t.includes('test file content'))).toBe(true);
  }, 15_000);

  it('called the LLM twice (tool call + final response)', () => {
    expect(harness.mock.callCount).toBe(2);
  });
});
