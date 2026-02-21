// Agent registry
export type { AgentRegistry, AgentRegistryEntry } from './agent-registry.js';

// Federated registry (cross-node dispatch)
export { FederatedAgentRegistry } from './federated-registry.js';
export type { FederatedAgentRegistryOptions } from './federated-registry.js';

// Remote dispatch
export { AsyncEventQueue } from './async-event-queue.js';
export { RemoteAgentRegistryEntry } from './remote-dispatch.js';
export type { RemoteDispatchTransport, RemoteAgentRegistryEntryOptions } from './remote-dispatch.js';

// Agent router
export { AgentRouter } from './agent-router.js';
export type { AgentRouterOptions } from './agent-router.js';

// Agent scheduler
export { AgentScheduler } from './agent-scheduler.js';
export type { DispatchFn, AgentSchedulerOptions } from './agent-scheduler.js';

// Tools
export {
  agentSpawnToolDefinition,
  createAgentSpawnHandler,
  agentSendToolDefinition,
  createAgentSendHandler,
  supervisorToolDefinition,
  createSupervisorHandler,
  pipelineToolDefinition,
  createPipelineHandler,
  broadcastToolDefinition,
  createBroadcastHandler,
} from './tools/index.js';
export type {
  AgentSpawnHandlerOptions,
  AgentSendHandlerOptions,
  SupervisorHandlerOptions,
  PipelineHandlerOptions,
  BroadcastHandlerOptions,
} from './tools/index.js';
