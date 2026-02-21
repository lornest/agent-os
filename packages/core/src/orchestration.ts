import type { BindingOverrides } from './config.js';

/** Priority levels for scheduled tasks. Lower number = higher priority. */
export enum TaskPriority {
  USER = 1,
  DELEGATION = 2,
  BACKGROUND = 3,
}

/** A task queued for dispatch to an agent. */
export interface ScheduledTask {
  id: string;
  agentId: string;
  message: string;
  sessionId?: string;
  priority: TaskPriority;
  enqueuedAt: number;
  correlationId?: string;
  bindingOverrides?: BindingOverrides;
}

/** Health information for an agent tracked by the router. */
export interface AgentHealthInfo {
  agentId: string;
  failureCount: number;
  lastFailureAt: number;
  circuitState: 'closed' | 'open' | 'half-open';
}

/** Configuration for the orchestration subsystem. */
export interface OrchestratorConfig {
  maxConcurrentAgents?: number;
  spawnTimeoutMs?: number;
  sendReplyTimeoutMs?: number;
  maxExchanges?: number;
  /** Timeout for remote (cross-node) agent dispatch via NATS. Default: 120000. */
  remoteDispatchTimeoutMs?: number;
}
