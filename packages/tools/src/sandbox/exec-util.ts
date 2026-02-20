import { execFile as cpExecFile } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Promise wrapper for child_process.execFile with timeout support.
 *
 * On success the exit code is 0.  On failure (non-zero exit, signal, or
 * timeout) the promise still resolves with whatever stdout/stderr was
 * captured so callers can inspect output without catching.
 */
export function execFile(
  command: string,
  args: string[],
  options?: { timeout?: number; cwd?: string; env?: Record<string, string> },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    cpExecFile(
      command,
      args,
      {
        timeout: options?.timeout,
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
        maxBuffer: 10 * 1024 * 1024, // 10 MiB
      },
      (error, stdout, stderr) => {
        if (error) {
          // `error.code` from child_process is the exit code when the
          // process exited with a non-zero status.  When the process was
          // killed (e.g. timeout) it may be undefined — fall back to 1.
          const exitCode =
            typeof (error as NodeJS.ErrnoException).code === 'number'
              ? ((error as NodeJS.ErrnoException).code as unknown as number)
              : 1;
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode });
          return;
        }
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 });
      },
    );
  });
}
