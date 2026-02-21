import { watch, type FSWatcher } from 'node:fs';

/** Debounced fs.watch wrapper for hot-reload. */
export class FileWatcher {
  private watchers: FSWatcher[] = [];
  private timers: NodeJS.Timeout[] = [];
  private debounceMs: number;

  constructor(debounceMs = 250) {
    this.debounceMs = debounceMs;
  }

  /**
   * Watch a directory for changes with debouncing.
   * Uses Node 22's `{ recursive: true }` support on macOS and Linux.
   */
  watch(directory: string, callback: (changedPath: string) => void): void {
    try {
      const onEvent = (_event: string, filename?: string | Buffer | null) => {
        const fullPath = filename ? `${directory}/${filename}` : directory;

        // Debounce: clear any pending timer and set a new one
        for (const timer of this.timers) {
          clearTimeout(timer);
        }
        this.timers = [];

        const timer = setTimeout(() => {
          callback(fullPath);
        }, this.debounceMs);

        this.timers.push(timer);
      };

      let watcher: FSWatcher;
      try {
        watcher = watch(directory, { recursive: true }, onEvent);
      } catch {
        // Recursive watch isn't supported on all platforms.
        watcher = watch(directory, {}, onEvent);
      }

      watcher.on('error', () => {
        // Avoid unhandled errors (e.g., EMFILE) from failing test runs.
        watcher.close();
      });

      this.watchers.push(watcher);
    } catch {
      // Directory may not exist; caller should handle
    }
  }

  /** Stop all watchers and clear pending timers. */
  close(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];

    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}
