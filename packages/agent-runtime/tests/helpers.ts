import type { FileSystem } from '../src/types.js';

/** In-memory FileSystem implementation for testing. */
export function createMemoryFs(): FileSystem {
  const files = new Map<string, string>();

  return {
    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file: ${path}`);
      }
      return content;
    },
    async writeFile(path: string, content: string): Promise<void> {
      files.set(path, content);
    },
    async appendFile(path: string, content: string): Promise<void> {
      const existing = files.get(path) ?? '';
      files.set(path, existing + content);
    },
    async mkdir(_path: string): Promise<void> {
      // No-op for in-memory FS
    },
    async exists(path: string): Promise<boolean> {
      // Check for exact file match or any file that starts with the path (directory)
      if (files.has(path)) return true;
      const dirPrefix = path.endsWith('/') ? path : path + '/';
      for (const key of files.keys()) {
        if (key.startsWith(dirPrefix)) return true;
      }
      return false;
    },
    async readdir(path: string): Promise<string[]> {
      const prefix = path.endsWith('/') ? path : path + '/';
      const entries = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          const relative = key.slice(prefix.length);
          const firstPart = relative.split('/')[0];
          if (firstPart) entries.add(firstPart);
        }
      }
      return [...entries];
    },
  };
}
