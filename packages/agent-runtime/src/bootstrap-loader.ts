import type { FileSystem } from './types.js';
import type { BootstrapConfig, BootstrapFile } from './prompt-types.js';

export class BootstrapLoader {
  constructor(
    private readonly agentDir: string,
    private readonly fs: FileSystem,
    private readonly config: BootstrapConfig,
  ) {}

  /** Loads bootstrap files in config order, respecting per-file and total char budgets. */
  async loadFiles(): Promise<BootstrapFile[]> {
    const files: BootstrapFile[] = [];
    let totalChars = 0;

    for (const name of this.config.fileNames) {
      const path = `${this.agentDir}/${name}`;

      if (!(await this.fs.exists(path))) continue;

      let content: string;
      try {
        content = await this.fs.readFile(path);
      } catch {
        continue;
      }

      const originalLength = content.length;
      const remainingBudget = this.config.maxTotalChars - totalChars;

      if (remainingBudget <= 0) break;

      const maxForFile = Math.min(this.config.maxCharsPerFile, remainingBudget);
      const truncated = content.length > maxForFile;

      if (truncated) {
        content = content.slice(0, maxForFile);
      }

      totalChars += content.length;
      files.push({ name, content, originalLength, truncated });
    }

    return files;
  }
}
