import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.isAllowed()).toBe(true);
  });

  it('stays CLOSED below failure threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.isAllowed()).toBe(true);
  });

  it('transitions to OPEN after reaching failure threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('OPEN');
    expect(cb.isAllowed()).toBe(false);
  });

  it('transitions to HALF_OPEN after cooldown', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 30_000,
    });
    for (let i = 0; i < 3; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('OPEN');

    vi.advanceTimersByTime(30_000);
    expect(cb.getState()).toBe('HALF_OPEN');
    expect(cb.isAllowed()).toBe(true);
  });

  it('transitions HALF_OPEN → CLOSED on success', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 30_000,
    });
    for (let i = 0; i < 3; i++) {
      cb.recordFailure();
    }
    vi.advanceTimersByTime(30_000);
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.recordSuccess();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.isAllowed()).toBe(true);
  });

  it('transitions HALF_OPEN → OPEN on failure', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 30_000,
    });
    for (let i = 0; i < 3; i++) {
      cb.recordFailure();
    }
    vi.advanceTimersByTime(30_000);
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
    expect(cb.isAllowed()).toBe(false);
  });

  it('uses sliding window — old failures expire', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 5,
      failureWindowMs: 60_000,
    });

    // Record 3 failures
    for (let i = 0; i < 3; i++) {
      cb.recordFailure();
    }
    // Advance past the window
    vi.advanceTimersByTime(61_000);

    // Record 3 more (old ones should have expired)
    for (let i = 0; i < 3; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('CLOSED');
  });

  it('success in CLOSED state is a no-op', () => {
    const cb = new CircuitBreaker();
    cb.recordSuccess();
    expect(cb.getState()).toBe('CLOSED');
  });
});
