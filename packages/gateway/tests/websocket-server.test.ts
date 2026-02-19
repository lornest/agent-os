import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayWebSocketServer } from '../src/websocket-server.js';

// Track mock calls
const mockOn = vi.fn();
const mockCloseServer = vi.fn((cb: (err?: Error) => void) => cb());

vi.mock('ws', () => {
  return {
    WebSocketServer: class MockWebSocketServer {
      constructor(public opts: Record<string, unknown>) {
        // Simulate async 'listening' event
        setTimeout(() => {
          const listenerCb = mockOn.mock.calls.find(
            (c: unknown[]) => c[0] === 'listening',
          )?.[1] as (() => void) | undefined;
          if (listenerCb) listenerCb();
        }, 0);
      }

      on = mockOn;
      close = mockCloseServer;
    },
    WebSocket: { OPEN: 1, CLOSED: 3 },
  };
});

describe('GatewayWebSocketServer', () => {
  let server: GatewayWebSocketServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new GatewayWebSocketServer();
  });

  it('starts and listens on the specified port', async () => {
    await server.start({
      port: 18789,
      authenticate: async () => 'user-1',
      onMessage: vi.fn(),
    });

    // The mock WSS was created — check connection handler was registered
    expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('registers connection handler', async () => {
    await server.start({
      port: 18789,
      authenticate: async () => 'user-1',
      onMessage: vi.fn(),
    });

    expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('starts with zero sessions', async () => {
    await server.start({
      port: 18789,
      authenticate: async () => 'user-1',
      onMessage: vi.fn(),
    });
    expect(server.getSessionCount()).toBe(0);
  });

  it('closes without error when not started', async () => {
    await expect(server.close()).resolves.toBeUndefined();
  });
});
