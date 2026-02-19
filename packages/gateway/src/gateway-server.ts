import type { AgentMessage, GatewayConfig } from '@agentic-os/core';
import { NatsClient } from './nats-client.js';
import { RedisClient } from './redis-client.js';
import { LaneQueue } from './lane-queue.js';
import { MessageRouter } from './router.js';
import { GatewayWebSocketServer } from './websocket-server.js';
import { HealthServer } from './health.js';
import { CircuitBreaker } from './circuit-breaker.js';
import type { LaneKey } from './types.js';

export class GatewayServer {
  private readonly nats = new NatsClient();
  private readonly redis = new RedisClient();
  private readonly laneQueue = new LaneQueue();
  private readonly router: MessageRouter;
  private readonly ws = new GatewayWebSocketServer();
  private readonly health = new HealthServer();
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

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
      onMessage: (msg: AgentMessage) => this.handleIncomingMessage(msg),
    });

    await this.health.start(this.config.websocket.port + 1, {
      isNatsConnected: () => this.nats.isConnected(),
      isRedisConnected: () => this.redis.isConnected(),
    });
  }

  private async handleIncomingMessage(msg: AgentMessage): Promise<void> {
    const laneKey: LaneKey = this.buildLaneKey(msg);

    await this.laneQueue.enqueue(laneKey, msg, async (m) => {
      // Idempotency check
      const key = m.idempotencyKey ?? m.id;
      const isNew = await this.redis.checkIdempotency(key);
      if (!isNew) return; // Duplicate, skip

      // Circuit breaker check
      const cb = this.getCircuitBreaker(m.target);
      if (!cb.isAllowed()) {
        throw new Error(`Circuit open for target: ${m.target}`);
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
      cb = new CircuitBreaker();
      this.circuitBreakers.set(target, cb);
    }
    return cb;
  }

  async stop(): Promise<void> {
    // Graceful shutdown in reverse order
    await this.health.close();
    await this.ws.close();
    await this.redis.close();
    await this.nats.close();
  }

  getNatsClient(): NatsClient {
    return this.nats;
  }

  getRedisClient(): RedisClient {
    return this.redis;
  }
}
