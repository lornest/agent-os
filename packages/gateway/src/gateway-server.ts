import type { AgentMessage, GatewayConfig } from '@agentic-os/core';
import { NatsClient } from './nats-client.js';
import { RedisClient } from './redis-client.js';
import { LaneQueue } from './lane-queue.js';
import { MessageRouter } from './router.js';
import { GatewayWebSocketServer } from './websocket-server.js';
import { HealthServer } from './health.js';
import { CircuitBreaker } from './circuit-breaker.js';
import type { LaneKey, Subscription } from './types.js';

export class GatewayServer {
  private readonly nats = new NatsClient();
  private readonly redis = new RedisClient();
  private readonly laneQueue = new LaneQueue();
  private readonly router: MessageRouter;
  private readonly ws = new GatewayWebSocketServer();
  private readonly health = new HealthServer();
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly targetSubscriptions = new Map<string, Subscription>();

  /** Maps correlationId → WS session ID for response routing. */
  private readonly pendingResponses = new Map<string, string>();
  /** Maps source URI → WS session ID for incoming connections. */
  private readonly sourceToSession = new Map<string, string>();
  /** Maps correlationId → callback for programmatic response listeners (channel adaptors). */
  private readonly responseListeners = new Map<string, (response: AgentMessage) => void>();

  constructor(private readonly config: GatewayConfig) {
    this.router = new MessageRouter(this.nats);
  }

  async start(): Promise<void> {
    // Start services in dependency order
    await this.nats.connect(this.config.nats.url, this.config.nats.credentials);
    await this.redis.connect(this.config.redis.url);

    await this.ws.start({
      port: this.config.websocket.port,
      host: this.config.websocket.host,
      authenticate: async (token: string) => {
        // Placeholder: accept any non-empty token as userId
        return token || null;
      },
      onMessage: (msg: AgentMessage, sessionId?: string) =>
        this.handleIncomingMessage(msg, sessionId),
    });

    await this.health.start(this.config.websocket.port + 1, {
      isNatsConnected: () => this.nats.isConnected(),
      isRedisConnected: () => this.redis.isConnected(),
    });
  }

  private async handleIncomingMessage(
    msg: AgentMessage,
    wsSessionId?: string,
  ): Promise<void> {
    // Track the WS session for response routing
    if (wsSessionId) {
      const correlationId = msg.correlationId ?? msg.id;
      this.pendingResponses.set(correlationId, wsSessionId);
      this.sourceToSession.set(msg.source, wsSessionId);
    }

    const laneKey: LaneKey = this.buildLaneKey(msg);

    await this.laneQueue.enqueue(laneKey, msg, async (m) => {
      // Idempotency check
      const key = m.idempotencyKey ?? m.id;
      const isNew = await this.redis.checkIdempotency(key);
      if (!isNew) return; // Duplicate, skip

      // Circuit breaker check — when open, consumer is paused so messages
      // shouldn't arrive, but guard silently just in case.
      const cb = this.getCircuitBreaker(m.target);
      if (!cb.isAllowed()) {
        return;
      }

      try {
        await this.router.route(m);
        cb.recordSuccess();
      } catch (err) {
        cb.recordFailure();
        throw err;
      }
    });
  }

  private buildLaneKey(msg: AgentMessage): LaneKey {
    // Extract components from source/target for lane ordering
    const source = msg.source.replace(/^\w+:\/\//, '');
    const target = msg.target.replace(/^\w+:\/\//, '');
    return `${source}:${target}:${msg.correlationId ?? 'default'}`;
  }

  private getCircuitBreaker(target: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(target);
    if (!cb) {
      cb = new CircuitBreaker({
        onStateChange: (newState) => {
          const sub = this.targetSubscriptions.get(target);
          if (!sub) return;
          if (newState === 'OPEN') {
            sub.pause();
          } else if (newState === 'CLOSED') {
            sub.resume().catch(() => {
              // Best-effort resume
            });
          }
        },
      });
      this.circuitBreakers.set(target, cb);
    }
    return cb;
  }

  registerSubscription(target: string, sub: Subscription): void {
    this.targetSubscriptions.set(target, sub);
  }

  unregisterSubscription(target: string): void {
    this.targetSubscriptions.delete(target);
  }

  async stop(): Promise<void> {
    // Graceful shutdown in reverse order
    await this.health.close();
    await this.ws.close();
    await this.redis.close();
    await this.nats.close();
  }

  /**
   * Inject a message into the full gateway pipeline (lane queue, idempotency,
   * circuit breaker, NATS routing) without a WebSocket session.
   * Used by channel adaptors to feed messages from external platforms.
   */
  async injectMessage(msg: AgentMessage): Promise<void> {
    await this.handleIncomingMessage(msg);
  }

  /**
   * Register a callback for responses matching a correlationId.
   * Channel adaptors use this to receive responses for injected messages.
   */
  onResponseForCorrelation(
    correlationId: string,
    handler: (response: AgentMessage) => void,
  ): void {
    this.responseListeners.set(correlationId, handler);
  }

  /**
   * Remove a programmatic response listener.
   */
  removeResponseListener(correlationId: string): void {
    this.responseListeners.delete(correlationId);
  }

  /**
   * Send a response back to the WS client that originated the request.
   * Looks up the WS session ID via the correlationId, then falls back
   * to programmatic response listeners (channel adaptors).
   */
  sendResponse(correlationId: string, response: AgentMessage): boolean {
    const wsSessionId = this.pendingResponses.get(correlationId);
    if (wsSessionId) {
      return this.ws.send(wsSessionId, response);
    }

    const listener = this.responseListeners.get(correlationId);
    if (listener) {
      listener(response);
      return true;
    }

    return false;
  }

  /**
   * Remove a pending response tracking entry.
   * Call after the final response has been sent.
   */
  completePendingResponse(correlationId: string): void {
    this.pendingResponses.delete(correlationId);
  }

  getNatsClient(): NatsClient {
    return this.nats;
  }

  getRedisClient(): RedisClient {
    return this.redis;
  }

  getWebSocketServer(): GatewayWebSocketServer {
    return this.ws;
  }
}
