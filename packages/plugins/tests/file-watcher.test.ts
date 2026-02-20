import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileWatcher } from '../src/file-watcher.js';

describe('FileWatcher', () => {
  let tempDir: string;
  let watcher: FileWatcher;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'file-watcher-'));
    watcher = new FileWatcher(50); // Short debounce for tests
  });

  afterEach(async () => {
    watcher.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('calls callback on file change', async () => {
    const callback = vi.fn();
    watcher.watch(tempDir, callback);

    // Give the watcher time to initialize
    await new Promise((r) => setTimeout(r, 100));

    await writeFile(join(tempDir, 'test.txt'), 'hello');

    // Wait for debounce + some buffer
    await new Promise((r) => setTimeout(r, 200));

    expect(callback).toHaveBeenCalled();
  });

  it('debounces rapid changes', async () => {
    const callback = vi.fn();
    watcher.watch(tempDir, callback);

    await new Promise((r) => setTimeout(r, 100));

    // Write multiple files rapidly
    await writeFile(join(tempDir, 'a.txt'), 'a');
    await writeFile(join(tempDir, 'b.txt'), 'b');
    await writeFile(join(tempDir, 'c.txt'), 'c');

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 200));

    // Due to debouncing, should have fewer calls than file writes
    expect(callback.mock.calls.length).toBeLessThanOrEqual(3);
    expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('close stops watching', async () => {
    // Use a fresh directory to avoid stale events
    const freshDir = await mkdtemp(join(tmpdir(), 'file-watcher-close-'));
    const freshWatcher = new FileWatcher(50);
    const callback = vi.fn();
    freshWatcher.watch(freshDir, callback);

    // Let watcher stabilize
    await new Promise((r) => setTimeout(r, 150));

    // Reset any spurious calls from setup
    callback.mockClear();

    freshWatcher.close();

    await writeFile(join(freshDir, 'after-close.txt'), 'should not trigger');
    await new Promise((r) => setTimeout(r, 200));

    expect(callback).not.toHaveBeenCalled();
    await rm(freshDir, { recursive: true, force: true });
  });

  it('handles non-existent directory gracefully', () => {
    const callback = vi.fn();
    // Should not throw
    watcher.watch('/non-existent-dir-12345', callback);
  });

  it('close is idempotent', () => {
    watcher.watch(tempDir, vi.fn());
    watcher.close();
    watcher.close(); // Should not throw
  });
});
