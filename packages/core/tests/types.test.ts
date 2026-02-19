import { describe, it, expect } from 'vitest';
import { AgentStatus, generateId, now, isRecord } from '../src/index.js';
import type {
  AgentMessage,
  AgentControlBlock,
  ToolDefinition,
  PluginManifest,
  LifecycleEvent,
} from '../src/index.js';

describe('core types', () => {
  it('exports AgentStatus enum with all states', () => {
    expect(AgentStatus.REGISTERED).toBe('REGISTERED');
    expect(AgentStatus.INITIALIZING).toBe('INITIALIZING');
    expect(AgentStatus.READY).toBe('READY');
    expect(AgentStatus.RUNNING).toBe('RUNNING');
    expect(AgentStatus.SUSPENDED).toBe('SUSPENDED');
    expect(AgentStatus.TERMINATED).toBe('TERMINATED');
    expect(AgentStatus.ERROR).toBe('ERROR');
  });

  it('AgentMessage interface is structurally valid', () => {
    const msg: AgentMessage = {
      id: generateId(),
      specversion: '1.0',
      type: 'task.request',
      source: 'agent://test-agent',
      target: 'agent://other-agent',
      time: now(),
      datacontenttype: 'application/json',
      data: { task: 'hello' },
    };
    expect(msg.specversion).toBe('1.0');
    expect(msg.id).toBeTruthy();
  });

  it('AgentControlBlock interface is structurally valid', () => {
    const acb: AgentControlBlock = {
      agentId: 'agent-1',
      status: AgentStatus.READY,
      priority: 1,
      loopIteration: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
      createdAt: now(),
      lastActiveAt: now(),
    };
    expect(acb.status).toBe(AgentStatus.READY);
  });

  it('ToolDefinition interface is structurally valid', () => {
    const tool: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file from the workspace',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
      annotations: {
        readOnly: true,
        riskLevel: 'green',
      },
    };
    expect(tool.name).toBe('read_file');
    expect(tool.annotations?.riskLevel).toBe('green');
  });

  it('PluginManifest interface is structurally valid', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
      capabilities: ['tools', 'hooks'],
    };
    expect(manifest.capabilities).toContain('tools');
  });

  it('LifecycleEvent type covers all events', () => {
    const events: LifecycleEvent[] = [
      'input',
      'before_agent_start',
      'agent_start',
      'turn_start',
      'context_assemble',
      'tool_call',
      'tool_execution_start',
      'tool_execution_end',
      'tool_result',
      'turn_end',
      'agent_end',
      'memory_flush',
      'session_compact',
    ];
    expect(events).toHaveLength(13);
  });
});

describe('core utilities', () => {
  it('generateId returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generateId returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('now returns an ISO 8601 string', () => {
    const timestamp = now();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it('isRecord identifies plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
  });
});
