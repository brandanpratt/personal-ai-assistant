import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck, type CheckDeps } from '../../../src/skills/files/check.js';
import { scan } from '../../../src/skills/files/scanner.js';
import { makeTempDir, removeDir } from '../../helpers/fs.js';

let base: string, root: string, state: string;
let notes: { title: string; text: string }[];
const NOW = new Date('2026-10-03T12:00:00Z');

const addFiles = (n: number, ageMinutes = 60, prefix = 'f') => {
  for (let i = 0; i < n; i++) {
    const p = path.join(root, `${prefix}${i}.pdf`);
    fs.writeFileSync(p, 'x');
    const t = new Date(NOW.getTime() - ageMinutes * 60_000);
    fs.utimesSync(p, t, t);
  }
};
const deps = (over: Partial<CheckDeps> = {}): CheckDeps => ({
  root, stateDir: state, now: NOW, minFiles: 5, cooldownHours: 24, minAgeMinutes: 10,
  scan, known: async () => undefined,
  notify: async (title, text) => void notes.push({ title, text }),
  ...over,
});
const listing = () => fs.readdirSync(root).sort().join(',');

beforeEach(() => {
  base = makeTempDir('check');
  root = path.join(base, 'root');
  state = path.join(base, 'state');
  fs.mkdirSync(root);
  notes = [];
});
afterEach(() => removeDir(base));

describe('runCheck', () => {
  it('stays quiet below the threshold', async () => {
    addFiles(3);
    expect(await runCheck(deps())).toEqual({ status: 'below-threshold', loose: 3 });
    expect(notes).toEqual([]);
  });

  it('notifies once above the threshold, writes a report, and never touches the files', async () => {
    addFiles(6);
    const before = listing();
    const res = await runCheck(deps());
    expect(res.status).toBe('notified');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.text).toMatch(/6 loose files/);
    if (res.status === 'notified') expect(fs.readFileSync(res.report, 'utf8')).toMatch(/Nothing was moved/);
    expect(listing()).toBe(before);
  });

  it('does not nag again within the cooldown, but does after it', async () => {
    addFiles(6);
    await runCheck(deps());
    expect((await runCheck(deps({ now: new Date(NOW.getTime() + 3_600_000) }))).status).toBe('cooldown');
    expect((await runCheck(deps({ now: new Date(NOW.getTime() + 25 * 3_600_000) }))).status).toBe('notified');
    expect(notes).toHaveLength(2);
  });

  it('ignores files that are probably still downloading', async () => {
    addFiles(3, 60);
    addFiles(10, 2, 'fresh');
    expect(await runCheck(deps())).toEqual({ status: 'below-threshold', loose: 3 });
  });

  it('includes remembered-folder matches in the message and report', async () => {
    addFiles(6);
    const res = await runCheck(deps({ known: async () => ({ byFolder: { Resumes: 4 }, matched: 4, readable: 6 }) }));
    expect(notes[0]!.text).toMatch(/4 fit your folders/);
    if (res.status === 'notified') expect(fs.readFileSync(res.report, 'utf8')).toMatch(/Resumes: 4/);
  });

  it('retries next time if the notification fails, and never throws', async () => {
    addFiles(6);
    const failing = deps({ notify: async () => { throw new Error('no GUI session'); } });
    expect(await runCheck(failing)).toMatchObject({ status: 'notify-failed', error: 'no GUI session' });
    expect((await runCheck(deps())).status).toBe('notified');
  });

  it('refuses to run concurrently, releases its lock, and reclaims a stale one', async () => {
    addFiles(6);
    fs.mkdirSync(state, { recursive: true });
    const lock = path.join(state, 'check.lock');
    fs.writeFileSync(lock, '');
    fs.utimesSync(lock, NOW, NOW);
    expect(await runCheck(deps())).toEqual({ status: 'locked' });
    const old = new Date(NOW.getTime() - 2 * 3_600_000);
    fs.utimesSync(lock, old, old); // a crashed run's leftover
    expect((await runCheck(deps())).status).toBe('notified');
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('releases the lock even when something throws', async () => {
    addFiles(6);
    await expect(runCheck(deps({ scan: async () => { throw new Error('disk gone'); } }))).rejects.toThrow('disk gone');
    expect(fs.existsSync(path.join(state, 'check.lock'))).toBe(false);
  });
});
