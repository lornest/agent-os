import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { HealthStatus } from './types.js';

export interface HealthCheckDeps {
  isNatsConnected: () => boolean;
  isRedisConnected: () => boolean;
}

export class HealthServer {
  private server: Server | null = null;
  private startTime = Date.now();

  async start(port: number, deps: HealthCheckDeps): Promise<void> {
    this.startTime = Date.now();

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405);
        res.end();
        return;
      }

      switch (req.url) {
        case '/health':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          break;

        case '/ready': {
          const nats = deps.isNatsConnected();
          const redis = deps.isRedisConnected();
          const status: HealthStatus = {
            status: nats && redis ? 'ok' : 'degraded',
            nats,
            redis,
            uptime: Date.now() - this.startTime,
          };
          res.writeHead(nats && redis ? 200 : 503, {
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify(status));
          break;
        }

        default:
          res.writeHead(404);
          res.end();
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, resolve);
    });
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.server = null;
  }
}
