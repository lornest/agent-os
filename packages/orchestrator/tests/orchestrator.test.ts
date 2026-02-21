import { describe, it, expect } from 'vitest';
import { AgentScheduler, AgentRouter } from '../src/index.js';

describe('orchestrator', () => {
  it('exports AgentScheduler', () => {
    expect(AgentScheduler).toBeDefined();
  });

  it('exports AgentRouter', () => {
    expect(AgentRouter).toBeDefined();
  });
});
