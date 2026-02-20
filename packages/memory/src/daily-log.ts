import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Read a daily log markdown file for a specific date. */
export async function readDailyLog(
  basePath: string,
  directory: string,
  date: string,
): Promise<string | null> {
  const filePath = join(basePath, directory, `${date}.md`);
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** List available daily log dates. */
export async function listDailyLogs(
  basePath: string,
  directory: string,
): Promise<string[]> {
  const dirPath = join(basePath, directory);
  try {
    const files = await readdir(dirPath);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

/** Write or append to a daily log file. */
export async function appendDailyLog(
  basePath: string,
  directory: string,
  date: string,
  content: string,
  writeFile: (path: string, content: string) => Promise<void>,
  readFileFn?: (path: string) => Promise<string>,
): Promise<void> {
  const filePath = join(basePath, directory, `${date}.md`);
  let existing = '';
  if (readFileFn) {
    try {
      existing = await readFileFn(filePath);
    } catch {
      // File doesn't exist yet
    }
  }
  const newContent = existing ? `${existing}\n\n${content}` : content;
  await writeFile(filePath, newContent);
}
