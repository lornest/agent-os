/**
 * Message envelope following CloudEvents v1.0 with agent extensions.
 */
export interface AgentMessage {
  /** UUIDv7 */
  id: string;
  specversion: '1.0';
  /** e.g. "task.request", "tool.invoke" */
  type: string;
  /** "agent://{id}" | "gateway://{nodeId}" */
  source: string;
  /** "agent://{id}" | "topic://{name}" */
  target: string;
  /** RFC 3339 */
  time: string;
  datacontenttype: string;
  data: unknown;
  correlationId?: string;
  causationId?: string;
  replyTo?: string;
  idempotencyKey?: string;
  sequenceNumber?: number;
  /** Time-to-live in milliseconds */
  ttl?: number;
  traceContext?: TraceContext;
  metadata?: Record<string, string>;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

/** Role in a conversation message. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** A single conversation message. */
export interface Message {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}
