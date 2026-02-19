import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { generateId, now } from '@agentic-os/core';
import type { AgentMessage } from '@agentic-os/core';
import type { WsSession, MessageHandler } from './types.js';

export interface WebSocketServerOptions {
  port: number;
  host?: string;
  authenticate: (token: string) => Promise<string | null>;
  onMessage: MessageHandler;
}

export class GatewayWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly sessions = new Map<string, { ws: WebSocket; session: WsSession }>();
  async start(options: WebSocketServerOptions): Promise<void> {
    this.wss = new WebSocketServer({
      port: options.port,
      host: options.host,
      verifyClient: async (info, cb) => {
        const token = this.extractToken(info.req);
        if (!token) {
          cb(false, 401, 'Unauthorized');
          return;
        }
        const userId = await options.authenticate(token);
        if (!userId) {
          cb(false, 403, 'Forbidden');
          return;
        }
        // Attach userId to the request for use in connection handler
        (info.req as IncomingMessage & { userId?: string }).userId = userId;
        cb(true);
      },
    });

    this.wss.on('connection', (ws, req) => {
      const userId = (req as IncomingMessage & { userId?: string }).userId ?? 'unknown';
      const sessionId = generateId();
      const session: WsSession = {
        id: sessionId,
        userId,
        connectedAt: now(),
      };
      this.sessions.set(sessionId, { ws, session });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as AgentMessage;
          options.onMessage(msg);
        } catch {
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.sessions.delete(sessionId);
      });

      ws.on('error', () => {
        this.sessions.delete(sessionId);
      });
    });

    await new Promise<void>((resolve) => {
      this.wss!.on('listening', resolve);
    });
  }

  send(sessionId: string, msg: AgentMessage): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.ws.readyState !== WebSocket.OPEN) return false;
    entry.ws.send(JSON.stringify(msg));
    return true;
  }

  broadcast(msg: AgentMessage): void {
    const payload = JSON.stringify(msg);
    for (const { ws } of this.sessions.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  getSession(sessionId: string): WsSession | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  async close(): Promise<void> {
    if (!this.wss) return;
    for (const { ws } of this.sessions.values()) {
      ws.close(1001, 'Server shutting down');
    }
    this.sessions.clear();
    await new Promise<void>((resolve, reject) => {
      this.wss!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.wss = null;
  }

  private extractToken(req: IncomingMessage): string | null {
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    // Fall back to query parameter
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }
}
