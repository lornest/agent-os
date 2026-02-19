import { Redis } from 'ioredis';

const IDEM_PREFIX = 'agentos:idem:';
const IDEM_TTL_SECONDS = 86_400;

export class RedisClient {
  private client: Redis | null = null;

  async connect(url: string): Promise<void> {
    this.client = new Redis(url, { lazyConnect: true });
    await this.client.connect();
  }

  /** Returns true if the key is new (message not seen before). */
  async checkIdempotency(key: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected');
    const result = await this.client.set(
      `${IDEM_PREFIX}${key}`,
      '1',
      'EX',
      IDEM_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
