import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ChannelAdaptor,
  ChannelAdaptorContext,
  ChannelAdaptorInfo,
  ChannelAdaptorStatus,
  OutboundMessage,
} from '@agentic-os/core';
import { getChatPageHtml } from './webchat-ui.js';

interface BrowserSession {
  ws: WebSocket;
  senderId: string;
  /** Maps correlationId → this session (for routing responses back). */
  pendingCorrelations: Set<string>;
}

export class WebChatAdaptor implements ChannelAdaptor {
  readonly info: ChannelAdaptorInfo = {
    channelType: 'webchat',
    displayName: 'WebChat',
    description: 'Browser-based chat interface',
  };

  private _status: ChannelAdaptorStatus = 'stopped';
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private ctx: ChannelAdaptorContext | null = null;
  private readonly sessions = new Map<string, BrowserSession>();
  /** Maps correlationId → session ID for response routing. */
  private readonly correlationToSession = new Map<string, string>();

  get status(): ChannelAdaptorStatus {
    return this._status;
  }

  async start(ctx: ChannelAdaptorContext): Promise<void> {
    this._status = 'starting';
    this.ctx = ctx;

    const port = (ctx.config.settings?.port as number) ?? 18800;
    const title = (ctx.config.settings?.title as string) ?? 'Agent OS WebChat';
    const html = getChatPageHtml({ title });

    // Register response handler
    ctx.onResponse((msg: OutboundMessage) => {
      this.handleOutbound(msg);
    });

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405);
        res.end();
        return;
      }

      switch (req.url) {
        case '/':
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          break;

        case '/health':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: this._status,
            healthy: this.isHealthy(),
            sessions: this.sessions.size,
          }));
          break;

        default:
          res.writeHead(404);
          res.end();
      }
    });

    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => {
      if (req.url === '/ws') {
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.wss!.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const sessionId = 'ws-' + Math.random().toString(36).slice(2, 10);
      const session: BrowserSession = {
        ws,
        senderId: '',
        pendingCorrelations: new Set(),
      };
      this.sessions.set(sessionId, session);

      ctx.logger.info(`WebChat session connected: ${sessionId}`);

      ws.on('message', async (raw: Buffer | string) => {
        try {
          const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
          const text = data.text as string;
          const senderId = data.senderId as string;

          if (!text || !senderId) return;

          session.senderId = senderId;

          const correlationId = await ctx.sendMessage({
            text,
            senderId,
            conversationId: sessionId,
          });

          session.pendingCorrelations.add(correlationId);
          this.correlationToSession.set(correlationId, sessionId);
        } catch (err) {
          ctx.logger.error(
            `WebChat message parse error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });

      ws.on('close', () => {
        // Clean up correlation mappings and gateway response listeners
        for (const cid of session.pendingCorrelations) {
          this.correlationToSession.delete(cid);
          ctx.removeResponseListener(cid);
        }
        this.sessions.delete(sessionId);
        ctx.logger.info(`WebChat session disconnected: ${sessionId}`);
      });
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, () => {
        this._status = 'running';
        ctx.logger.info(`WebChat adaptor listening on port ${port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.wss) {
      for (const session of this.sessions.values()) {
        session.ws.close(1001, 'Server shutting down');
      }
      this.wss.close();
      this.wss = null;
    }

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.server = null;
    }

    this.sessions.clear();
    this.correlationToSession.clear();
    this._status = 'stopped';
  }

  isHealthy(): boolean {
    return this._status === 'running' && this.server !== null;
  }

  private handleOutbound(msg: OutboundMessage): void {
    const sessionId = this.correlationToSession.get(msg.correlationId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) return;

    session.ws.send(JSON.stringify({
      text: msg.text,
      agentId: msg.agentId,
      correlationId: msg.correlationId,
    }));

    // Don't remove the mapping here — the agent may send multiple
    // responses per turn (tool results, streaming chunks, final answer).
    // Cleanup happens on WS disconnect.
  }
}
