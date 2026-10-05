import fs from 'node:fs';
import path from 'node:path';

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Parsed JSON from a file, or undefined if it is missing or not valid JSON. */
export function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Writes JSON via a temp file and rename, creating the folder, so a crash can't leave a half-written file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}
