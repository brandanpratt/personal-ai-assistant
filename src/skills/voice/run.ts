import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Runs a program with an argument list (never through a shell). Injected so tests need no binaries. */
export type RunFn = (bin: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const INSTALL: Record<string, string> = {
  ffmpeg: 'brew install ffmpeg',
  'whisper-cli': 'brew install whisper-cpp',
};

export const installHint = (bin: string) => INSTALL[path.basename(bin)] ?? `install ${bin} or set its path in .env`;

export const runBinary: RunFn = (bin, args) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve({ stdout, stderr });
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new Error(`"${bin}" not found. Fix: ${installHint(bin)}`));
      const tail = stderr.trim().split('\n').slice(-3).join(' | ');
      reject(new Error(`${path.basename(bin)} failed${tail ? `: ${tail}` : ''}`));
    });
  });

/** Full path of an executable, looking through PATH for bare names. Doesn't run it. */
export function findExecutable(bin: string, envPath = process.env.PATH ?? ''): string | undefined {
  const candidates = bin.includes('/') ? [bin] : envPath.split(path.delimiter).filter(Boolean).map((d) => path.join(d, bin));
  return candidates.find((c) => {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return fs.statSync(c).isFile();
    } catch {
      return false;
    }
  });
}
