import type { Logger } from './plugins.js';

export type ChannelAdaptorStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface ChannelAdaptorInfo {
  channelType: string;
  displayName: string;
  description: string;
}

export interface InboundMessage {
  text: string;
  senderId: string;
  conversationId?: string;
  accountId?: string;
  platformData?: Record<string, unknown>;
}

export interface OutboundMessage {
  text: string;
  agentId: string;
  correlationId: string;
  data?: Record<string, unknown>;
}

export interface ChannelAdaptorContext {
  sendMessage(inbound: InboundMessage): Promise<string>;
  onResponse(handler: (msg: OutboundMessage) => void): void;
  /** Remove the gateway response listener for a correlationId (cleanup on disconnect). */
  removeResponseListener(correlationId: string): void;
  resolveAgent(channelType: string, senderId: string, conversationId?: string): string;
  logger: Logger;
  config: ChannelAdaptorConfig;
}

export interface ChannelAdaptor {
  readonly info: ChannelAdaptorInfo;
  readonly status: ChannelAdaptorStatus;
  start(ctx: ChannelAdaptorContext): Promise<void>;
  stop(): Promise<void>;
  isHealthy(): boolean;
}

export interface ChannelsConfig {
  adaptors: Record<string, ChannelAdaptorConfig>;
}

export interface ChannelAdaptorConfig {
  enabled: boolean;
  settings?: Record<string, unknown>;
}
