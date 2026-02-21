/**
 * Bridges push-based callbacks (e.g. NATS subscriptions) into a pull-based
 * AsyncGenerator. No polling — uses promise-based signaling.
 */
export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiting: {
    resolve: (value: IteratorResult<T>) => void;
    reject: (err: Error) => void;
  } | null = null;
  private done = false;
  private err: Error | null = null;

  /** Producer: enqueue an item (or resolve a waiting consumer). */
  push(item: T): void {
    if (this.done) return;
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w.resolve({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }

  /** Signal end of stream. */
  complete(): void {
    if (this.done) return;
    this.done = true;
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w.resolve({ value: undefined as unknown as T, done: true });
    }
  }

  /** Signal an error. */
  error(err: Error): void {
    if (this.done) return;
    this.done = true;
    this.err = err;
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w.reject(err);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        // Drain buffer first (even if errored — deliver buffered items)
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }

        // If errored (and buffer empty), throw
        if (this.err) {
          const err = this.err;
          this.err = null;
          return Promise.reject(err);
        }

        // Already complete
        if (this.done) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }

        // Wait for next push/complete/error
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiting = { resolve, reject };
        });
      },

      return: (): Promise<IteratorResult<T>> => {
        this.done = true;
        this.buffer.length = 0;
        this.err = null;
        if (this.waiting) {
          const w = this.waiting;
          this.waiting = null;
          w.resolve({ value: undefined as unknown as T, done: true });
        }
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      },
    };
  }
}
