/** JSON Schema type for tool input/output definitions. */
export type JSONSchema = Record<string, unknown>;

/** Risk level for tool annotations. */
export type RiskLevel = 'green' | 'yellow' | 'red' | 'critical';

/** MCP-compatible tool definition. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  annotations?: ToolAnnotations;
}

export interface ToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  riskLevel: RiskLevel;
}

/** Result of executing a tool. */
export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

/** A function that handles a tool invocation. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/** Map from tool name to its handler function. */
export type ToolHandlerMap = Map<string, ToolHandler>;

/** Origin of a tool registration. */
export type ToolSource = 'builtin' | 'mcp' | 'plugin' | 'memory' | 'orchestration';

/** Entry in the tool registry combining definition + handler + metadata. */
export interface ToolRegistryEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
  source: ToolSource;
  mcpServer?: string;
}

/** Context passed to the policy engine for permission resolution. */
export interface PolicyContext {
  agentId: string;
  sessionId?: string;
  sandboxMode?: 'off' | 'non-main' | 'all';
  bindingTools?: { allow?: string[]; deny?: string[] };
}
