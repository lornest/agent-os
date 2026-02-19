import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisClient } from '../src/redis-client.js';

// Track mock Redis behavior
let mockSetResult: string | null = 'OK';

vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      status = 'ready';
      connect = vi.fn().mockResolvedValue(undefined);
      set = vi.fn(async () => mockSetResult);
      quit = vi.fn(async () => {
        this.status = 'end';
      });
    },
  };
});

describe('RedisClient', () => {
  let client: RedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetResult = 'OK';
    client = new RedisClient();
  });

  it('connects to Redis', async () => {
    await client.connect('redis://localhost:6379');
    expect(client.isConnected()).toBe(true);
  });

  it('checkIdempotency returns true for new key', async () => {
    await client.connect('redis://localhost:6379');
    const isNew = await client.checkIdempotency('msg-1');
    expect(isNew).toBe(true);
  });

  it('checkIdempotency returns false for duplicate key', async () => {
    await client.connect('redis://localhost:6379');
    mockSetResult = null;
    const isNew = await client.checkIdempotency('msg-dup');
    expect(isNew).toBe(false);
  });

  it('throws if not connected', async () => {
    await expect(client.checkIdempotency('key')).rejects.toThrow(
      'Redis not connected',
    );
  });

  it('closes cleanly', async () => {
    await client.connect('redis://localhost:6379');
    await client.close();
    expect(client.isConnected()).toBe(false);
  });
});
