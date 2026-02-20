import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Binding,
  ChannelAdaptor,
  ChannelAdaptorContext,
  ChannelAdaptorInfo,
  ChannelAdaptorStatus,
  ChannelsConfig,
  Logger,
} from '@agentic-os/core';
import { ChannelManager } from '../src/channel-manager.js';

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeMockGateway() {
  return {
    injectMessage: vi.fn().mockResolvedValue(undefined),
    onResponseForCorrelation: vi.fn(),
    removeResponseListener: vi.fn(),
    sendResponse: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    getNatsClient: vi.fn(),
    getRedisClient: vi.fn(),
    getWebSocketServer: vi.fn(),
    registerSubscription: vi.fn(),
    unregisterSubscription: vi.fn(),
    completePendingResponse: vi.fn(),
  };
}

function makeMockAdaptor(
  channelType: string,
  overrides: Partial<ChannelAdaptor> = {},
): ChannelAdaptor {
  let _status: ChannelAdaptorStatus = 'stopped';
  return {
    info: {
      channelType,
      displayName: channelType,
      description: `Mock ${channelType} adaptor`,
    } satisfies ChannelAdaptorInfo,
    get status() {
      return _status;
    },
    start: vi.fn(async (_ctx: ChannelAdaptorContext) => {
      _status = 'running';
    }),
    stop: vi.fn(async () => {
      _status = 'stopped';
    }),
    isHealthy: vi.fn(() => _status === 'running'),
    ...overrides,
  };
}

const bindings: Binding[] = [
  { channel: 'default', agentId: 'assistant' },
];

const channelsConfig: ChannelsConfig = {
  adaptors: {
    webchat: { enabled: true },
    telegram: { enabled: false },
  },
};

describe('ChannelManager', () => {
  let gateway: ReturnType<typeof makeMockGateway>;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = makeMockGateway();
    logger = makeLogger();
  });

  it('registers an adaptor', () => {
    const manager = new ChannelManager({ gateway: gateway as any, bindings, channelsConfig, logger });
    const adaptor = makeMockAdaptor('webchat');
    manager.register(adaptor);

    expect(manager.getStatuses()).toHaveLength(1);
    expect(manager.getStatuses()[0]).toEqual({
      type: 'webchat',
      status: 'stopped',
      healthy: false,
    });
  });

  it('rejects duplicate channel type registration', () => {
    const manager = new ChannelManager({ gateway: gateway as any, bindings, channelsConfig, logger });
    manager.register(makeMockAdaptor('webchat'));
    expect(() => manager.register(makeMockAdaptor('webchat'))).toThrow(
      'already registered',
    );
  });

  it('starts enabled adaptors and skips disabled', async () => {
    const manager = new ChannelManager({ gateway: gateway as any, bindings, channelsConfig, logger });
    const webchat = makeMockAdaptor('webchat');
    const telegram = makeMockAdaptor('telegram');

    manager.register(webchat);
    manager.register(telegram);

    await manager.startAll();

    expect(webchat.start).toHaveBeenCalled();
    expect(telegram.start).not.toHaveBeenCalled();
  });

  it('logs error when adaptor start fails', async () => {
    const manager = new ChannelManager({ gateway: gateway as any, bindings, channelsConfig, logger });
    const failing = makeMockAdaptor('webchat', {
      start: vi.fn(async () => {
        throw new Error('port in use');
      }),
    });

    manager.register(failing);
    await manager.startAll();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('port in use'),
    );
  });

  it('stops all running adaptors', async () => {
    const manager = new ChannelManager({ gateway: gateway as any, bindings, channelsConfig, logger });
    const adaptor = makeMockAdaptor('webchat');
    manager.register(adaptor);

    await manager.startAll();
    expect(adaptor.status).toBe('running');

    await manager.stopAll();
    expect(adaptor.stop).toHaveBeenCalled();
  });

  it('getStatuses returns correct statuses', async () => {
    const manager = new ChannelManager({ gateway: gateway as any, bindings, channelsConfig, logger });
    const webchat = makeMockAdaptor('webchat');
    const telegram = makeMockAdaptor('telegram');

    manager.register(webchat);
    manager.register(telegram);

    await manager.startAll();

    const statuses = manager.getStatuses();
    expect(statuses).toHaveLength(2);

    const webchatStatus = statuses.find((s) => s.type === 'webchat');
    expect(webchatStatus?.status).toBe('running');
    expect(webchatStatus?.healthy).toBe(true);

    const telegramStatus = statuses.find((s) => s.type === 'telegram');
    expect(telegramStatus?.status).toBe('stopped');
    expect(telegramStatus?.healthy).toBe(false);
  });
});
