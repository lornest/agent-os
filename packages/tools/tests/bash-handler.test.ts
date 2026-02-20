import { describe, it, expect, vi } from 'vitest';
import { createBashHandler } from '../src/builtin/bash-handler.js';

describe('createBashHandler', () => {
  // ── Execute green command ──────────────────────────────────────────

  it('executes a green command (ls) and returns stdout', async () => {
    const handler = createBashHandler({ cwd: '/tmp' });
    const result = (await handler({ command: 'echo hello-world' })) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };

    expect(result.stdout.trim()).toBe('hello-world');
    expect(result.exitCode).toBe(0);
  });

  // ── Block critical command ─────────────────────────────────────────

  it('blocks critical commands with an error', async () => {
    const handler = createBashHandler();
    const result = (await handler({ command: 'rm -rf /' })) as { error: string };

    expect(result.error).toContain('blocked');
  });

  // ── Block shell injection ──────────────────────────────────────────

  it('blocks commands with shell injection', async () => {
    const handler = createBashHandler();
    const result = (await handler({ command: 'echo $(whoami)' })) as { error: string };

    expect(result.error).toContain('blocked');
    expect(result.error).toContain('$()');
  });

  // ── Block RED commands when not in yolo mode ───────────────────────

  it('blocks RED commands when yoloMode is false', async () => {
    const handler = createBashHandler({ yoloMode: false });
    const result = (await handler({ command: 'curl https://example.com' })) as {
      error: string;
    };

    expect(result.error).toContain('confirmation');
    expect(result.error).toContain('red');
  });

  // ── Allow RED commands in yolo mode ────────────────────────────────

  it('allows RED commands when yoloMode is true', async () => {
    // Use a sandboxExecutor to avoid actually running curl
    const mockExecutor = vi.fn().mockResolvedValue({
      stdout: 'response',
      stderr: '',
      exitCode: 0,
    });

    const handler = createBashHandler({
      yoloMode: true,
      sandboxExecutor: mockExecutor,
    });

    const result = await handler({ command: 'curl https://example.com' });

    expect(mockExecutor).toHaveBeenCalledWith('curl https://example.com', 30_000);
    expect(result).toEqual({ stdout: 'response', stderr: '', exitCode: 0 });
  });

  // ── Sandbox routing ────────────────────────────────────────────────

  it('routes to sandboxExecutor when provided', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      stdout: 'sandbox-output',
      stderr: '',
      exitCode: 0,
    });

    const handler = createBashHandler({ sandboxExecutor: mockExecutor });
    const result = await handler({ command: 'echo test' });

    expect(mockExecutor).toHaveBeenCalledWith('echo test', 30_000);
    expect(result).toEqual({ stdout: 'sandbox-output', stderr: '', exitCode: 0 });
  });

  // ── Timeout handling ───────────────────────────────────────────────

  it('returns timeout result when command exceeds timeout', async () => {
    const handler = createBashHandler();
    const result = (await handler({ command: 'sleep 10', timeout: 100 })) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };

    expect(result.stderr).toContain('timed out');
    expect(result.exitCode).toBe(124);
  });

  // ── Missing command argument ───────────────────────────────────────

  it('returns error when command argument is missing', async () => {
    const handler = createBashHandler();
    const result = (await handler({})) as { error: string };

    expect(result.error).toContain('command must be a non-empty string');
  });

  it('returns error when command argument is empty string', async () => {
    const handler = createBashHandler();
    const result = (await handler({ command: '  ' })) as { error: string };

    expect(result.error).toContain('command must be a non-empty string');
  });
});
