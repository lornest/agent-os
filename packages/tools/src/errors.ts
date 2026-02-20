/** Thrown when registering a tool with a name that already exists. */
export class ToolConflictError extends Error {
  constructor(name: string) {
    super(`Tool already registered: ${name}`);
    this.name = 'ToolConflictError';
  }
}

/** Thrown when a requested tool is not found in the registry. */
export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Tool not found: ${name}`);
    this.name = 'ToolNotFoundError';
  }
}

/** Thrown when tool argument validation fails. */
export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

/** Thrown when a sandbox operation fails. */
export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

/** Thrown when an MCP server connection fails. */
export class McpConnectionError extends Error {
  constructor(serverName: string, cause?: string) {
    super(`MCP connection failed for server "${serverName}"${cause ? `: ${cause}` : ''}`);
    this.name = 'McpConnectionError';
  }
}
