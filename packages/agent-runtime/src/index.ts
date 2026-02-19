// Types
export type {
  AssembledContext,
  ToolCallHookResult,
  HookEntry,
  SessionHeader,
  SessionEntry,
  SessionLine,
  LLMServiceOptions,
  ActiveBinding,
  FileSystem,
  AgentManagerOptions,
} from './types.js';

// Errors
export {
  HookBlockError,
  InvalidStateTransitionError,
  SessionCorruptError,
  LLMProviderUnavailableError,
} from './errors.js';

// Hook registry
export { HookRegistry } from './hook-registry.js';

// LLM service
export { LLMService } from './llm-service.js';

// Tool executor
export { executeToolCall, buildToolHandlerMap } from './tool-executor.js';
export type { ToolHandler, ToolHandlerMap } from './tool-executor.js';

// Conversation context
export { ConversationContext } from './conversation-context.js';

// Session store
export { SessionStore } from './session-store.js';

// Context compactor
export { ContextCompactor } from './context-compactor.js';
export type { ContextCompactorOptions } from './context-compactor.js';

// Agent loop
export { agentLoop } from './agent-loop.js';

// Agent manager
export { AgentManager } from './agent-manager.js';
