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
      const watcher = watch(directory, { recursive: true }, (_event, filename) => {
        if (!filename) return;

        const fullPath = `${directory}/${filename}`;

        // Debounce: clear any pending timer and set a new one
        for (const timer of this.timers) {
          clearTimeout(timer);
        }
        this.timers = [];

        const timer = setTimeout(() => {
          callback(fullPath);
        }, this.debounceMs);

        this.timers.push(timer);
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
