import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveInside } from './pathGuard.js';

export interface FileInfo {
  path: string;
  name: string;
  /** Lowercased extension without the dot; '' if none. */
  ext: string;
  size: number;
  modified: Date;
}

export interface ScanOptions {
  /** How many directory levels below root to descend. 0 = root only. Default 0. */
  maxDepth?: number;
  includeHidden?: boolean;
}

/** Lists regular files under `root`. Never follows symlinks; skips hidden files by default. */
export async function scan(root: string, opts: ScanOptions = {}): Promise<FileInfo[]> {
  const { maxDepth = 0, includeHidden = false } = opts;
  const realRoot = resolveInside(root, '.');
  const results: FileInfo[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!includeHidden && entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        results.push({
          path: full,
          name: entry.name,
          ext: path.extname(entry.name).slice(1).toLowerCase(),
          size: stat.size,
          modified: stat.mtime,
        });
      }
    }
  }

  await walk(realRoot, 0);
  return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
