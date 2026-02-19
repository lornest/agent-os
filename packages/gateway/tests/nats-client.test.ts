import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NatsClient } from '../src/nats-client.js';
import type { AgentMessage } from '@agentic-os/core';

function makeMsg(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    specversion: '1.0',
    type: 'task.request',
    source: 'agent://sender',
    target: 'agent://receiver',
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data: { task: 'test' },
    ...overrides,
  };
}

// Build mock infrastructure
const mockConsume = vi.fn().mockResolvedValue({
  [Symbol.asyncIterator]: () => ({
    next: vi.fn().mockResolvedValue({ done: true, value: undefined }),
  }),
  stop: vi.fn(),
});

const mockConsumersGet = vi.fn().mockResolvedValue({
  consume: mockConsume,
});

const mockConsumersAdd = vi.fn().mockResolvedValue({});
const mockConsumersUpdate = vi.fn().mockResolvedValue({});

const mockStreamsAdd = vi.fn().mockResolvedValue({});
const mockStreamsUpdate = vi.fn().mockResolvedValue({});
const mockStreamsGetMessage = vi.fn().mockResolvedValue(null);

const mockPublish = vi.fn().mockResolvedValue({ seq: 1 });

const mockRequest = vi.fn().mockImplementation((_subject, data) => {
  return Promise.resolve({ data });
});

const mockSubscribe = vi.fn().mockReturnValue({
  [Symbol.asyncIterator]: () => ({
    next: vi.fn().mockResolvedValue({ done: true, value: undefined }),
  }),
  unsubscribe: vi.fn(),
});

const mockDrain = vi.fn().mockResolvedValue(undefined);

vi.mock('nats', () => ({
  connect: vi.fn().mockImplementation(() =>
    Promise.resolve({
      jetstream: () => ({
        publish: mockPublish,
        consumers: {
          get: mockConsumersGet,
        },
      }),
      jetstreamManager: () =>
        Promise.resolve({
          streams: {
            add: mockStreamsAdd,
            update: mockStreamsUpdate,
            getMessage: mockStreamsGetMessage,
          },
          consumers: {
            add: mockConsumersAdd,
            update: mockConsumersUpdate,
          },
        }),
      request: mockRequest,
      subscribe: mockSubscribe,
      drain: mockDrain,
      isClosed: () => false,
    }),
  ),
  JSONCodec: () => ({
    encode: (v: unknown) => new TextEncoder().encode(JSON.stringify(v)),
    decode: (d: Uint8Array) => JSON.parse(new TextDecoder().decode(d)),
  }),
  StringCodec: () => ({
    encode: (v: string) => new TextEncoder().encode(v),
    decode: (d: Uint8Array) => new TextDecoder().decode(d),
  }),
  headers: () => ({
    set: vi.fn(),
    get: vi.fn(),
  }),
  AckPolicy: { Explicit: 'explicit' },
  RetentionPolicy: { Workqueue: 'workqueue', Interest: 'interest', Limits: 'limits' },
  DeliverPolicy: { All: 'all' },
}));

describe('NatsClient', () => {
  let client: NatsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new NatsClient();
  });

  it('connects and creates streams', async () => {
    await client.connect('nats://localhost:4222');
    expect(client.isConnected()).toBe(true);
    // 3 streams should be created
    expect(mockStreamsAdd).toHaveBeenCalledTimes(3);
  });

  it('handles existing streams by updating', async () => {
    mockStreamsAdd.mockRejectedValueOnce(new Error('already in use'));
    mockStreamsAdd.mockResolvedValueOnce({});
    mockStreamsAdd.mockResolvedValueOnce({});

    await client.connect('nats://localhost:4222');
    expect(mockStreamsUpdate).toHaveBeenCalledTimes(1);
  });

  it('publishes a message with idempotency header', async () => {
    await client.connect('nats://localhost:4222');
    const msg = makeMsg({ idempotencyKey: 'idem-123' });

    await client.publish('agent.test.inbox', msg);
    expect(mockPublish).toHaveBeenCalledWith(
      'agent.test.inbox',
      expect.any(Uint8Array),
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it('sends a request/reply message', async () => {
    await client.connect('nats://localhost:4222');
    const msg = makeMsg();

    const response = await client.request('agent.test.inbox', msg, 5000);
    expect(mockRequest).toHaveBeenCalledWith(
      'agent.test.inbox',
      expect.any(Uint8Array),
      { timeout: 5000 },
    );
    expect(response).toBeDefined();
  });

  it('fan-out sends to multiple subjects', async () => {
    await client.connect('nats://localhost:4222');
    const msgs = [makeMsg({ id: 'a' }), makeMsg({ id: 'b' })];

    const responses = await client.fanOut(
      ['agent.a.inbox', 'agent.b.inbox'],
      msgs,
    );
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(responses).toHaveLength(2);
  });

  it('subscribes to a subject', async () => {
    await client.connect('nats://localhost:4222');

    const handler = vi.fn();
    const sub = await client.subscribe('agent.test.inbox', handler);
    expect(sub.subject).toBe('agent.test.inbox');
    expect(mockConsumersAdd).toHaveBeenCalled();
  });

  it('pauses and resumes a consumer', async () => {
    await client.connect('nats://localhost:4222');

    await client.pauseConsumer('AGENT_TASKS', 'my-consumer');
    expect(mockConsumersUpdate).toHaveBeenCalledWith(
      'AGENT_TASKS',
      'my-consumer',
      expect.objectContaining({ metadata: { paused: 'true' } }),
    );

    await client.resumeConsumer('AGENT_TASKS', 'my-consumer');
    expect(mockConsumersUpdate).toHaveBeenCalledWith(
      'AGENT_TASKS',
      'my-consumer',
      expect.objectContaining({ metadata: { paused: 'false' } }),
    );
  });

  it('closes cleanly', async () => {
    await client.connect('nats://localhost:4222');
    await client.close();
    expect(mockDrain).toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });

  it('exposes stream definitions', () => {
    const defs = client.getStreamDefinitions();
    expect(defs).toHaveLength(3);
    expect(defs.map((d) => d.name)).toEqual([
      'AGENT_TASKS',
      'AGENT_EVENTS',
      'SYSTEM',
    ]);
  });

  it('throws when not connected', async () => {
    const msg = makeMsg();
    await expect(client.publish('test', msg)).rejects.toThrow(
      'NATS not connected',
    );
    await expect(client.request('test', msg)).rejects.toThrow(
      'NATS not connected',
    );
  });
});
