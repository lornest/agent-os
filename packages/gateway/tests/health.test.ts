import { describe, it, expect, afterEach } from 'vitest';
import { HealthServer } from '../src/health.js';

const TEST_PORT = 19790;

describe('HealthServer', () => {
  let server: HealthServer;

  afterEach(async () => {
    await server?.close();
  });

  it('GET /health returns 200', async () => {
    server = new HealthServer();
    await server.start(TEST_PORT, {
      isNatsConnected: () => true,
      isRedisConnected: () => true,
    });

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /ready returns 200 when all deps connected', async () => {
    server = new HealthServer();
    await server.start(TEST_PORT, {
      isNatsConnected: () => true,
      isRedisConnected: () => true,
    });

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/ready`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.nats).toBe(true);
    expect(body.redis).toBe(true);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /ready returns 503 when NATS disconnected', async () => {
    server = new HealthServer();
    await server.start(TEST_PORT, {
      isNatsConnected: () => false,
      isRedisConnected: () => true,
    });

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/ready`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.nats).toBe(false);
  });

  it('GET /ready returns 503 when Redis disconnected', async () => {
    server = new HealthServer();
    await server.start(TEST_PORT, {
      isNatsConnected: () => true,
      isRedisConnected: () => false,
    });

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/ready`);
    expect(res.status).toBe(503);
  });

  it('returns 404 for unknown paths', async () => {
    server = new HealthServer();
    await server.start(TEST_PORT, {
      isNatsConnected: () => true,
      isRedisConnected: () => true,
    });

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/unknown`);
    expect(res.status).toBe(404);
  });

  it('returns 405 for non-GET methods', async () => {
    server = new HealthServer();
    await server.start(TEST_PORT, {
      isNatsConnected: () => true,
      isRedisConnected: () => true,
    });

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
  });

  it('closes without error when not started', async () => {
    server = new HealthServer();
    await expect(server.close()).resolves.toBeUndefined();
  });
});
