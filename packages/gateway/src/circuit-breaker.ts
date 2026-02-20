import type { CircuitState, CircuitBreakerOptions } from './types.js';

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  failureWindowMs: 60_000,
  cooldownMs: 30_000,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number[] = [];
  private openedAt: number | null = null;
  private readonly options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getState(): CircuitState {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.options.cooldownMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  isAllowed(): boolean {
    const current = this.getState();
    return current === 'CLOSED' || current === 'HALF_OPEN';
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN' || this.state === 'OPEN') {
      this.state = 'CLOSED';
      this.failures = [];
      this.openedAt = null;
      this.options.onStateChange?.('CLOSED');
    }
  }

  recordFailure(): void {
    const now = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.openedAt = now;
      this.failures = [now];
      this.options.onStateChange?.('OPEN');
      return;
    }

    this.failures.push(now);
    this.pruneOldFailures(now);

    if (this.failures.length >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = now;
      this.options.onStateChange?.('OPEN');
    }
  }

  private pruneOldFailures(now: number): void {
    const cutoff = now - this.options.failureWindowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}
