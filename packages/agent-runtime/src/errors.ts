/** Thrown by a hook handler to block a tool execution. */
export class HookBlockError extends Error {
  constructor(public readonly reason: string) {
    super(`Hook blocked execution: ${reason}`);
    this.name = 'HookBlockError';
  }
}

/** Thrown when an invalid lifecycle state transition is attempted. */
export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

/** Thrown when a session JSONL file cannot be parsed. */
export class SessionCorruptError extends Error {
  constructor(
    public readonly sessionId: string,
    cause?: unknown,
  ) {
    super(`Session ${sessionId} is corrupt`);
    this.name = 'SessionCorruptError';
    this.cause = cause;
  }
}

/** Thrown when no LLM provider profile is available. */
export class LLMProviderUnavailableError extends Error {
  constructor(message = 'All LLM provider profiles exhausted') {
    super(message);
    this.name = 'LLMProviderUnavailableError';
  }
}
