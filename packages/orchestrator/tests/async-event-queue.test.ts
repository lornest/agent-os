import { describe, it, expect } from 'vitest';
import { AsyncEventQueue } from '../src/async-event-queue.js';

describe('AsyncEventQueue', () => {
  it('yields pushed items in order', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.push(3);
    queue.complete();

    const items: number[] = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).toEqual([1, 2, 3]);
  });

  it('buffers items until consumed', async () => {
    const queue = new AsyncEventQueue<string>();
    queue.push('a');
    queue.push('b');

    const iter = queue[Symbol.asyncIterator]();
    const r1 = await iter.next();
    expect(r1).toEqual({ value: 'a', done: false });

    const r2 = await iter.next();
    expect(r2).toEqual({ value: 'b', done: false });

    queue.complete();
    const r3 = await iter.next();
    expect(r3.done).toBe(true);
  });

  it('resolves waiting consumer when item is pushed', async () => {
    const queue = new AsyncEventQueue<number>();
    const iter = queue[Symbol.asyncIterator]();

    // Start waiting before push
    const promise = iter.next();
    queue.push(42);

    const result = await promise;
    expect(result).toEqual({ value: 42, done: false });

    queue.complete();
  });

  it('signals completion', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.complete();

    const iter = queue[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  it('signals completion while consumer is waiting', async () => {
    const queue = new AsyncEventQueue<number>();
    const iter = queue[Symbol.asyncIterator]();

    const promise = iter.next();
    queue.complete();

    const result = await promise;
    expect(result.done).toBe(true);
  });

  it('signals error', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.error(new Error('boom'));

    const iter = queue[Symbol.asyncIterator]();
    // First item should be delivered
    const r1 = await iter.next();
    expect(r1).toEqual({ value: 1, done: false });

    // Next should throw
    await expect(iter.next()).rejects.toThrow('boom');
  });

  it('signals error while consumer is waiting', async () => {
    const queue = new AsyncEventQueue<number>();
    const iter = queue[Symbol.asyncIterator]();

    const promise = iter.next();
    queue.error(new Error('kaboom'));

    // The waiting consumer's promise is rejected directly
    await expect(promise).rejects.toThrow('kaboom');
  });

  it('ignores push after complete', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.complete();
    queue.push(2); // should be ignored

    const items: number[] = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).toEqual([1]);
  });

  it('ignores push after error', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.error(new Error('fail'));
    queue.push(1); // should be ignored

    const iter = queue[Symbol.asyncIterator]();
    await expect(iter.next()).rejects.toThrow('fail');
  });

  it('supports early return (generator cancellation)', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.push(3);

    const iter = queue[Symbol.asyncIterator]();
    const r1 = await iter.next();
    expect(r1.value).toBe(1);

    // Cancel
    const returnResult = await iter.return!(undefined as unknown as number);
    expect(returnResult.done).toBe(true);

    // Further pushes should be ignored (queue is done)
    queue.push(4);
    const r2 = await iter.next();
    expect(r2.done).toBe(true);
  });

  it('works with for-await-of and interleaved push/consume', async () => {
    const queue = new AsyncEventQueue<number>();
    const collected: number[] = [];

    const consumer = (async () => {
      for await (const item of queue) {
        collected.push(item);
      }
    })();

    // Push with small delays to interleave
    queue.push(10);
    await new Promise((r) => setTimeout(r, 5));
    queue.push(20);
    await new Promise((r) => setTimeout(r, 5));
    queue.push(30);
    queue.complete();

    await consumer;
    expect(collected).toEqual([10, 20, 30]);
  });
});
