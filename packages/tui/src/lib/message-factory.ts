import type { AgentMessage } from '@clothos/core';
import { generateId, now } from '@clothos/core';

/**
 * Build a task.request AgentMessage for sending user input to an agent.
 * Follows the same envelope pattern as the channel message builder and web UI.
 */
export function createTaskRequest(agentId: string, text: string, sessionId?: string): AgentMessage {
  return {
    id: generateId(),
    specversion: '1.0',
    type: 'task.request',
    source: 'tui://local',
    target: `agent://${agentId}`,
    time: now(),
    datacontenttype: 'application/json',
    data: { text, ...(sessionId ? { sessionId } : {}) },
    correlationId: generateId(),
  };
}
