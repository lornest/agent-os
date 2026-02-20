import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChannelAdaptorContext, ChannelAdaptorConfig, Logger } from '@agentic-os/core';
import { WebChatAdaptor } from '../src/adaptors/webchat-adaptor.js';

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeContext(overrides: Partial<ChannelAdaptorContext> = {}): ChannelAdaptorContext {
  const config: ChannelAdaptorConfig = {
    enabled: true,
    settings: {
      port: 0, // random port for tests
      title: 'Test Chat',
    },
  };

  return {
    sendMessage: vi.fn().mockResolvedValue('corr-123'),
    onResponse: vi.fn(),
    removeResponseListener: vi.fn(),
    resolveAgent: vi.fn().mockReturnValue('assistant'),
    logger: makeLogger(),
    config,
    ...overrides,
  };
}

describe('WebChatAdaptor', () => {
  let adaptor: WebChatAdaptor;

  beforeEach(() => {
    adaptor = new WebChatAdaptor();
  });

  afterEach(async () => {
    if (adaptor.status !== 'stopped') {
      await adaptor.stop();
    }
  });

  it('has correct info', () => {
    expect(adaptor.info.channelType).toBe('webchat');
    expect(adaptor.info.displayName).toBe('WebChat');
  });

  it('starts in stopped status', () => {
    expect(adaptor.status).toBe('stopped');
    expect(adaptor.isHealthy()).toBe(false);
  });

  it('starts and becomes healthy', async () => {
    const ctx = makeContext();
    await adaptor.start(ctx);

    expect(adaptor.status).toBe('running');
    expect(adaptor.isHealthy()).toBe(true);
  });

  it('stops cleanly', async () => {
    const ctx = makeContext();
    await adaptor.start(ctx);
    await adaptor.stop();

    expect(adaptor.status).toBe('stopped');
    expect(adaptor.isHealthy()).toBe(false);
  });

  it('registers response handler on start', async () => {
    const ctx = makeContext();
    await adaptor.start(ctx);

    expect(ctx.onResponse).toHaveBeenCalledWith(expect.any(Function));
  });

  it('serves HTML on GET /', async () => {
    const ctx = makeContext();
    await adaptor.start(ctx);

    // Find the port dynamically — access the internal server
    const server = (adaptor as any).server;
    const address = server.address();
    const port = typeof address === 'object' ? address.port : 0;

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('Test Chat');
    expect(html).toContain('WebSocket');
  });

  it('serves health endpoint', async () => {
    const ctx = makeContext();
    await adaptor.start(ctx);

    const server = (adaptor as any).server;
    const address = server.address();
    const port = typeof address === 'object' ? address.port : 0;

    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('running');
    expect(body.healthy).toBe(true);
  });

  it('returns 404 for unknown paths', async () => {
    const ctx = makeContext();
    await adaptor.start(ctx);

    const server = (adaptor as any).server;
    const address = server.address();
    const port = typeof address === 'object' ? address.port : 0;

    const res = await fetch(`http://localhost:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});
