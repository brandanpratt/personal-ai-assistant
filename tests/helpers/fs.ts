import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A fresh temp folder. realpath'd because macOS /tmp is a symlink and our path guard resolves symlinks. */
export function makeTempDir(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)));
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Writes a file at `rel` under `root`, creating folders as needed. */
export function writeFile(root: string, rel: string, body = 'x'): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}
