import type { ToolDefinition, ToolHandler } from './tools.js';

/** Capabilities a plugin can declare. */
export type PluginCapability = 'tools' | 'hooks' | 'commands' | 'skills';

/** Plugin manifest declared in package.json. */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  dependencies?: Record<string, string>;
  capabilities?: PluginCapability[];
}

/** Disposable handle returned from registrations. */
export interface Disposable {
  dispose(): void;
}

/** Handler for lifecycle hooks. */
export type HookHandler = (context: unknown) => Promise<unknown> | unknown;

/** Handler for slash commands. */
export type CommandHandler = (args: string) => Promise<string | void> | string | void;

/** Logger interface provided to plugins. */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Context provided to plugins during onLoad. */
export interface PluginContext {
  registerTool(def: ToolDefinition, handler: ToolHandler): void;
  registerHook(event: LifecycleEvent, handler: HookHandler): Disposable;
  registerCommand(name: string, handler: CommandHandler): Disposable;
  getService<T>(name: string): T;
  logger: Logger;
  config: Record<string, unknown>;
}

/** Plugin contract. */
export interface Plugin {
  manifest: PluginManifest;
  onLoad(ctx: PluginContext): Promise<void>;
  onUnload(): Promise<void>;
}

/** Lifecycle hook events fired during agent execution. */
export type LifecycleEvent =
  | 'input'
  | 'before_agent_start'
  | 'agent_start'
  | 'turn_start'
  | 'context_assemble'
  | 'tool_call'
  | 'tool_execution_start'
  | 'tool_execution_end'
  | 'tool_result'
  | 'turn_end'
  | 'agent_end'
  | 'memory_flush'
  | 'session_compact';
