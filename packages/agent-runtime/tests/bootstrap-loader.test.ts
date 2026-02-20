import { describe, it, expect } from 'vitest';
import { BootstrapLoader } from '../src/bootstrap-loader.js';
import { createMemoryFs } from './helpers.js';

describe('BootstrapLoader', () => {
  it('loads files in config order', async () => {
    const fs = createMemoryFs();
    await fs.writeFile('/agent/SOUL.md', 'soul content');
    await fs.writeFile('/agent/TOOLS.md', 'tools content');

    const loader = new BootstrapLoader('/agent', fs, {
      fileNames: ['SOUL.md', 'TOOLS.md'],
      maxCharsPerFile: 20_000,
      maxTotalChars: 150_000,
    });

    const files = await loader.loadFiles();
    expect(files).toHaveLength(2);
    expect(files[0]!.name).toBe('SOUL.md');
    expect(files[0]!.content).toBe('soul content');
    expect(files[1]!.name).toBe('TOOLS.md');
    expect(files[1]!.content).toBe('tools content');
  });

  it('skips missing files', async () => {
    const fs = createMemoryFs();
    await fs.writeFile('/agent/SOUL.md', 'soul');

    const loader = new BootstrapLoader('/agent', fs, {
      fileNames: ['SOUL.md', 'MISSING.md', 'ALSO_MISSING.md'],
      maxCharsPerFile: 20_000,
      maxTotalChars: 150_000,
    });

    const files = await loader.loadFiles();
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('SOUL.md');
  });

  it('truncates files exceeding maxCharsPerFile', async () => {
    const fs = createMemoryFs();
    const longContent = 'x'.repeat(500);
    await fs.writeFile('/agent/BIG.md', longContent);

    const loader = new BootstrapLoader('/agent', fs, {
      fileNames: ['BIG.md'],
      maxCharsPerFile: 100,
      maxTotalChars: 150_000,
    });

    const files = await loader.loadFiles();
    expect(files).toHaveLength(1);
    expect(files[0]!.content).toHaveLength(100);
    expect(files[0]!.originalLength).toBe(500);
    expect(files[0]!.truncated).toBe(true);
  });

  it('stops when maxTotalChars is exhausted', async () => {
    const fs = createMemoryFs();
    await fs.writeFile('/agent/A.md', 'a'.repeat(80));
    await fs.writeFile('/agent/B.md', 'b'.repeat(80));
    await fs.writeFile('/agent/C.md', 'c'.repeat(80));

    const loader = new BootstrapLoader('/agent', fs, {
      fileNames: ['A.md', 'B.md', 'C.md'],
      maxCharsPerFile: 20_000,
      maxTotalChars: 150,
    });

    const files = await loader.loadFiles();
    // A.md (80) + B.md (70 truncated from 80) = 150 total, C.md skipped
    expect(files).toHaveLength(2);
    expect(files[0]!.name).toBe('A.md');
    expect(files[0]!.truncated).toBe(false);
    expect(files[1]!.name).toBe('B.md');
    expect(files[1]!.content).toHaveLength(70);
    expect(files[1]!.truncated).toBe(true);
  });

  it('returns empty array when no files exist', async () => {
    const fs = createMemoryFs();

    const loader = new BootstrapLoader('/agent', fs, {
      fileNames: ['SOUL.md', 'TOOLS.md'],
      maxCharsPerFile: 20_000,
      maxTotalChars: 150_000,
    });

    const files = await loader.loadFiles();
    expect(files).toHaveLength(0);
  });

  it('marks non-truncated files correctly', async () => {
    const fs = createMemoryFs();
    await fs.writeFile('/agent/SMALL.md', 'tiny');

    const loader = new BootstrapLoader('/agent', fs, {
      fileNames: ['SMALL.md'],
      maxCharsPerFile: 20_000,
      maxTotalChars: 150_000,
    });

    const files = await loader.loadFiles();
    expect(files[0]!.truncated).toBe(false);
    expect(files[0]!.originalLength).toBe(4);
  });
});
