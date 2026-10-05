import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execute } from '../../../src/skills/files/executor.js';
import { emptyMemory, hasMemorySnapshot, loadMemory, restoreMemoryBeforeRun, saveLearnedMemory, saveMemory, type Memory } from '../../../src/skills/files/memory.js';
import { planMoves } from '../../../src/skills/files/planner.js';
import { scan } from '../../../src/skills/files/scanner.js';
import { describeUndo, undoRun } from '../../../src/skills/files/undoRun.js';
import { makeTempDir, removeDir, writeFile } from '../../helpers/fs.js';

let base: string, root: string, state: string, memFile: string;
const MODEL = 'm';
const mem = (...names: string[]): Memory => ({ ...emptyMemory(MODEL), folders: names.map((name) => ({ name, centroid: [1, 0], count: 2 })) });
const names = () => loadMemory(memFile, MODEL).folders.map((f) => f.name);
const write = (rel: string, body?: string) => writeFile(root, rel, body);
/** Runs a type-only plan and records `after` as learned memory, like an approved organize run. */
async function run(after: Memory | undefined) {
  const res = execute(root, planMoves(root, await scan(root)).moves, state);
  if (after) saveLearnedMemory(memFile, res.journalFile, loadMemory(memFile, MODEL), after);
  return res.journalFile;
}

beforeEach(() => {
  base = makeTempDir('undorun');
  root = path.join(base, 'root');
  state = path.join(base, 'state');
  memFile = path.join(state, 'memory.json');
  fs.mkdirSync(root);
});
afterEach(() => removeDir(base));

describe('memory snapshots', () => {
  it('restore deletes the memory file when there was none before the run', () => {
    const journal = path.join(state, 'journals', 'r1.jsonl');
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    saveLearnedMemory(memFile, journal, emptyMemory(MODEL), mem('Resumes'));
    expect(hasMemorySnapshot(journal)).toBe(true);
    expect(restoreMemoryBeforeRun(memFile, journal)).toBe(true);
    expect(fs.existsSync(memFile)).toBe(false);
    expect(hasMemorySnapshot(journal)).toBe(false);
  });

  it('restore brings back the exact previous memory', () => {
    const journal = path.join(state, 'journals', 'r1.jsonl');
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    saveMemory(memFile, mem('Old'));
    saveLearnedMemory(memFile, journal, mem('Old'), mem('Old', 'New'));
    expect(names()).toEqual(['Old', 'New']);
    restoreMemoryBeforeRun(memFile, journal);
    expect(loadMemory(memFile, MODEL)).toEqual(mem('Old'));
  });

  it('does nothing for a run with no snapshot or a corrupt one', () => {
    saveMemory(memFile, mem('Keep'));
    const journal = path.join(state, 'journals', 'r1.jsonl');
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    expect(restoreMemoryBeforeRun(memFile, journal)).toBe(false);
    fs.writeFileSync(journal.replace('.jsonl', '.memory-before.json'), '{garbage');
    expect(restoreMemoryBeforeRun(memFile, journal)).toBe(false);
    expect(names()).toEqual(['Keep']);
  });
});

describe('undoRun', () => {
  it('restores the files and forgets what the run learned', async () => {
    write('cv.pdf');
    const journal = await run(mem('Resumes'));
    expect(names()).toEqual(['Resumes']);
    const res = undoRun(journal, memFile);
    expect(res).toMatchObject({ restored: 1, memory: 'forgot' });
    expect(fs.existsSync(path.join(root, 'cv.pdf'))).toBe(true);
    expect(fs.existsSync(memFile)).toBe(false);
    expect(describeUndo(res)).toMatch(/Forgot the folders/);
  });

  it('with two runs, undoing the newest forgets only its folders, then the older one', async () => {
    write('a.pdf');
    const j1 = await run(mem('Resumes'));
    write('b.pdf');
    const j2 = await run(mem('Resumes', 'Invoices'));
    undoRun(j2, memFile);
    expect(names()).toEqual(['Resumes']);
    undoRun(j1, memFile);
    expect(fs.existsSync(memFile)).toBe(false);
  });

  it('keeps what was learned when some files could not be restored', async () => {
    write('a.pdf');
    const journal = await run(mem('Resumes'));
    write('a.pdf'); // the original spot is taken again, so this file cannot go back
    const res = undoRun(journal, memFile);
    expect(res).toMatchObject({ restored: 0, memory: 'kept' });
    expect(res.skipped).toHaveLength(1);
    expect(names()).toEqual(['Resumes']);
    expect(describeUndo(res)).toMatch(/were kept/);
  });

  it('leaves memory alone for a run that learned nothing', async () => {
    saveMemory(memFile, mem('Existing'));
    write('a.pdf');
    const journal = await run(undefined);
    const res = undoRun(journal, memFile);
    expect(res.memory).toBe('none');
    expect(names()).toEqual(['Existing']);
    expect(describeUndo(res)).toBe('Restored 1, skipped 0.');
  });
});
