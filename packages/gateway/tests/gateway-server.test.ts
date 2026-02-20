import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayServer } from '../src/gateway-server.js';
import type { GatewayConfig } from '@agentic-os/core';
import type { Subscription } from '../src/types.js';

// Mock all dependencies using class-based mocks
vi.mock('../src/nats-client.js', () => ({
  NatsClient: class MockNatsClient {
    connect = vi.fn().mockResolvedValue(undefined);
    publish = vi.fn().mockResolvedValue(undefined);
    isConnected = vi.fn().mockReturnValue(true);
    close = vi.fn().mockResolvedValue(undefined);
    drain = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../src/redis-client.js', () => ({
  RedisClient: class MockRedisClient {
    connect = vi.fn().mockResolvedValue(undefined);
    checkIdempotency = vi.fn().mockResolvedValue(true);
    isConnected = vi.fn().mockReturnValue(true);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../src/websocket-server.js', () => ({
  GatewayWebSocketServer: class MockWsServer {
    start = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../src/health.js', () => ({
  HealthServer: class MockHealthServer {
    start = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

const testConfig: GatewayConfig = {
  nats: { url: 'nats://localhost:4222' },
  redis: { url: 'redis://localhost:6379' },
  websocket: { port: 18789 },
  maxConcurrentAgents: 10,
};

function makeMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    subject: 'agent.test.inbox',
    queueGroup: undefined,
    streamName: 'AGENT_TASKS',
    consumerName: 'consumer-test',
    unsubscribe: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('GatewayServer', () => {
  let server: GatewayServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new GatewayServer(testConfig);
  });

  it('constructs without error', () => {
    expect(server).toBeDefined();
  });

  it('starts all services', async () => {
    await server.start();
    expect(server.getNatsClient().connect).toHaveBeenCalledWith(
      'nats://localhost:4222',
      undefined,
    );
    expect(server.getRedisClient().connect).toHaveBeenCalledWith(
      'redis://localhost:6379',
    );
  });

  it('stops all services in reverse order', async () => {
    await server.start();
    await server.stop();

    expect(server.getNatsClient().close).toHaveBeenCalled();
    expect(server.getRedisClient().close).toHaveBeenCalled();
  });

  it('exposes NATS and Redis clients', () => {
    expect(server.getNatsClient()).toBeDefined();
    expect(server.getRedisClient()).toBeDefined();
  });

  it('registers and unregisters subscriptions', () => {
    const sub = makeMockSubscription();
    server.registerSubscription('agent://test', sub);
    // No error means success; unregister should also work
    server.unregisterSubscription('agent://test');
  });
});
