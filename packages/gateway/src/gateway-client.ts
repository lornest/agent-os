import { WebSocket } from 'ws';
import type { AgentMessage, GatewayTransport, Logger } from '@agentic-os/core';

export interface GatewayClientOptions {
  /** WebSocket URL, e.g. ws://localhost:18789/ws */
  url: string;
  /** Shared-secret token for authentication. */
  authToken?: string;
  /** Auto-reconnect on disconnect. Default: true. */
  reconnect?: boolean;
  /** Max reconnect backoff in ms. Default: 30 000. */
  maxReconnectDelayMs?: number;
  logger?: Logger;
}

/**
 * WebSocket client that connects to a GatewayServer as a regular client.
 * Used by channel adaptors so they go through the same auth, rate-limiting,
 * and circuit-breaker pipeline as every other client (e.g. the web UI).
 */
export class GatewayClient implements GatewayTransport {
  private ws: WebSocket | null = null;
  private readonly responseHandlers = new Map<string, (msg: AgentMessage) => void>();
  private readonly url: string;
  private readonly authToken: string | undefined;
  private readonly shouldReconnect: boolean;
  private readonly maxReconnectDelayMs: number;
  private readonly logger: Logger | undefined;

  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;

  constructor(options: GatewayClientOptions) {
    this.url = options.url;
    this.authToken = options.authToken;
    this.shouldReconnect = options.reconnect ?? true;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.logger = options.logger;
  }

  async connect(): Promise<void> {
    this.closing = false;
    return this.doConnect();
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close(1000, 'Client shutting down');
    }
    this.responseHandlers.clear();
  }

  async send(msg: AgentMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('GatewayClient is not connected');
    }
    this.ws.send(JSON.stringify(msg));
  }

  onResponse(correlationId: string, handler: (msg: AgentMessage) => void): void {
    this.responseHandlers.set(correlationId, handler);
  }

  removeResponseHandler(correlationId: string): void {
    this.responseHandlers.delete(correlationId);
  }

  private doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = this.authToken
        ? `${this.url}${this.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.authToken)}`
        : this.url;

      const ws = new WebSocket(url);

      ws.on('open', () => {
        this.ws = ws;
        this.reconnectAttempt = 0;
        this.logger?.info('GatewayClient connected');
        resolve();
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as AgentMessage;
          const correlationId = msg.correlationId ?? msg.id;
          const handler = this.responseHandlers.get(correlationId);
          if (handler) {
            handler(msg);
          }
        } catch {
          this.logger?.warn('GatewayClient: failed to parse incoming message');
        }
      });

      ws.on('close', () => {
        this.ws = null;
        if (!this.closing) {
          this.logger?.warn('GatewayClient disconnected');
          this.scheduleReconnect();
        }
      });

      ws.on('error', (err) => {
        if (!this.ws) {
          // Connection failed on initial attempt
          reject(new Error(`GatewayClient connection failed: ${err.message}`));
          return;
        }
        this.logger?.error(`GatewayClient error: ${err.message}`);
      });
    });
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.closing) return;

    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempt,
      this.maxReconnectDelayMs,
    );
    this.reconnectAttempt++;

    this.logger?.info(`GatewayClient reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect().catch((err) => {
        this.logger?.error(
          `GatewayClient reconnect failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.scheduleReconnect();
      });
    }, delay);
  }
}
