// Types
export type {
  CircuitState,
  CircuitBreakerOptions,
  LaneKey,
  WsSession,
  Subscription,
  MessageHandler,
  StreamDefinition,
  GatewayOptions,
  HealthStatus,
} from './types.js';

// Circuit breaker
export { CircuitBreaker } from './circuit-breaker.js';

// Lane queue
export { LaneQueue } from './lane-queue.js';

// Redis client
export { RedisClient } from './redis-client.js';

// NATS client
export { NatsClient } from './nats-client.js';

// Router
export { MessageRouter, parseTarget } from './router.js';
export type { ParsedTarget } from './router.js';

// WebSocket server
export { GatewayWebSocketServer } from './websocket-server.js';
export type { WebSocketServerOptions } from './websocket-server.js';

// Health server
export { HealthServer } from './health.js';
export type { HealthCheckDeps } from './health.js';

// Gateway server (top-level orchestrator)
export { GatewayServer } from './gateway-server.js';
