import fs from 'node:fs';
import path from 'node:path';
import { categorize } from './categories.js';
import type { KnownSummary } from './organize.js';
import type { FileInfo } from './scanner.js';

export interface CheckDeps {
  root: string;
  stateDir: string;
  now: Date;
  minFiles: number;
  cooldownHours: number;
  minAgeMinutes: number;
  scan: (root: string) => Promise<FileInfo[]>;
  known: (files: FileInfo[]) => Promise<KnownSummary | undefined>;
  notify: (title: string, text: string) => Promise<void>;
}

export type CheckResult =
  | { status: 'locked' }
  | { status: 'below-threshold'; loose: number }
  | { status: 'cooldown'; loose: number }
  | { status: 'notify-failed'; loose: number; error: string }
  | { status: 'notified'; loose: number; report: string; message: string };

const LOCK_STALE_MS = 30 * 60 * 1000;

/** Exclusive lock so overlapping scheduled runs can't pile up. A crashed run's lock expires. */
function acquireLock(file: string, now: Date): (() => void) | undefined {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.closeSync(fs.openSync(file, 'wx'));
      return () => fs.rmSync(file, { force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (now.getTime() - fs.statSync(file).mtimeMs < LOCK_STALE_MS) return undefined;
      fs.rmSync(file, { force: true }); // stale: previous run died
    }
  }
  return undefined;
}

function readState(file: string): { lastNotifiedAt?: string } {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * The scheduled, autonomous part. NOTIFY-ONLY: it never moves, renames or deletes anything.
 * It counts loose files (ignoring ones still downloading), and when enough have piled up and we
 * haven't nagged recently, it writes a report and sends one notification.
 */
export async function runCheck(d: CheckDeps): Promise<CheckResult> {
  const release = acquireLock(path.join(d.stateDir, 'check.lock'), d.now);
  if (!release) return { status: 'locked' };
  try {
    const cutoff = d.now.getTime() - d.minAgeMinutes * 60_000;
    const loose = (await d.scan(d.root)).filter((f) => f.modified.getTime() <= cutoff);
    if (loose.length < d.minFiles) return { status: 'below-threshold', loose: loose.length };

    const stateFile = path.join(d.stateDir, 'check.json');
    const last = readState(stateFile).lastNotifiedAt;
    if (last && d.now.getTime() - new Date(last).getTime() < d.cooldownHours * 3_600_000) {
      return { status: 'cooldown', loose: loose.length };
    }

    const known = await d.known(loose);
    const byType = new Map<string, number>();
    for (const f of loose) {
      const c = categorize(f.ext) ?? 'No rule';
      byType.set(c, (byType.get(c) ?? 0) + 1);
    }
    const lines = [
      `# Downloads check, ${d.now.toISOString()}`,
      '',
      `${loose.length} loose files in ${d.root} (files touched in the last ${d.minAgeMinutes} minutes ignored).`,
      '',
      '## By type',
      ...[...byType].sort((a, b) => b[1] - a[1]).map(([c, n]) => `- ${c}: ${n}`),
      '',
      '## Remembered folders',
      known
        ? known.matched > 0
          ? [`${known.matched} of ${known.readable} readable files fit folders you approved before:`, ...Object.entries(known.byFolder).map(([f, n]) => `- ${f}: ${n}`)].join('\n')
          : `None of the ${known.readable} readable files match a remembered folder yet.`
        : 'Not available (no memory yet, or Ollama was not running).',
      '',
      'Nothing was moved. To organize, run: npm run chat',
    ];
    const reportsDir = path.join(d.stateDir, 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const report = path.join(reportsDir, `${d.now.toISOString().replace(/[:.]/g, '-')}.md`);
    fs.writeFileSync(report, lines.join('\n') + '\n');

    const message =
      `${loose.length} loose files in Downloads` +
      (known && known.matched > 0 ? `, ${known.matched} fit your folders` : '') +
      '. Run "npm run chat" to organize.';
    try {
      await d.notify('File Organizer', message);
    } catch (err) {
      // don't record the notification, so the next run tries again
      return { status: 'notify-failed', loose: loose.length, error: err instanceof Error ? err.message : String(err) };
    }
    fs.writeFileSync(stateFile, JSON.stringify({ lastNotifiedAt: d.now.toISOString() }));
    return { status: 'notified', loose: loose.length, report, message };
  } finally {
    release();
  }
}
