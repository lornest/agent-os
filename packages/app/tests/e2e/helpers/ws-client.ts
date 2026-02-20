import WebSocket from 'ws';
import { generateId, now } from '@agentic-os/core';
import type { AgentMessage } from '@agentic-os/core';

interface WsClientOptions {
  port: number;
  host?: string;
  token?: string;
  /** Connection timeout in ms. Default: 5000 */
  timeout?: number;
}

/**
 * WebSocket test client that connects to the gateway and sends/receives
 * AgentMessage envelopes.
 */
export class WsTestClient {
  private ws: WebSocket | null = null;
  private readonly received: AgentMessage[] = [];
  private resolvers: Array<(msg: AgentMessage) => void> = [];

  /** Connect to the gateway. */
  async connect(options: WsClientOptions): Promise<void> {
    const { port, host = 'localhost', token = 'test-token', timeout = 5000 } = options;
    const url = `ws://${host}:${port}?token=${encodeURIComponent(token)}`;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`WS connection timeout after ${timeout}ms`)),
        timeout,
      );

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as AgentMessage;
          this.received.push(msg);
          // Wake up any waiters
          const resolver = this.resolvers.shift();
          if (resolver) resolver(msg);
        } catch {
          // Ignore non-JSON messages
        }
      });
    });
  }

  /**
   * Send an AgentMessage to the gateway targeting a specific agent.
   * Returns the correlationId for matching responses.
   */
  sendToAgent(agentId: string, text: string, sessionId?: string): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const correlationId = generateId();
    const msg: AgentMessage = {
      id: generateId(),
      specversion: '1.0',
      type: 'task.request',
      source: 'client://test',
      target: `agent://${agentId}`,
      time: now(),
      datacontenttype: 'application/json',
      data: { text, sessionId },
      correlationId,
    };

    this.ws.send(JSON.stringify(msg));
    return correlationId;
  }

  /**
   * Wait for a response message, optionally filtered by correlationId.
   * Throws on timeout.
   */
  async waitForResponse(
    correlationId?: string,
    timeoutMs = 10_000,
  ): Promise<AgentMessage> {
    // Check already-received messages first
    const existing = correlationId
      ? this.received.find((m) => m.correlationId === correlationId)
      : this.received.shift();

    if (existing) {
      if (correlationId) {
        const idx = this.received.indexOf(existing);
        this.received.splice(idx, 1);
      }
      return existing;
    }

    // Wait for a new message
    return new Promise<AgentMessage>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for response after ${timeoutMs}ms`)),
        timeoutMs,
      );

      const check = (msg: AgentMessage) => {
        if (!correlationId || msg.correlationId === correlationId) {
          clearTimeout(timer);
          resolve(msg);
        } else {
          // Not our message, keep waiting
          this.resolvers.push(check);
        }
      };

      this.resolvers.push(check);
    });
  }

  /** Get all received messages. */
  getReceived(): AgentMessage[] {
    return [...this.received];
  }

  /** Clear received messages. */
  clearReceived(): void {
    this.received.length = 0;
  }

  /** Disconnect from the gateway. */
  async disconnect(): Promise<void> {
    if (!this.ws) return;
    return new Promise<void>((resolve) => {
      this.ws!.on('close', () => resolve());
      this.ws!.close();
      this.ws = null;
    });
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
