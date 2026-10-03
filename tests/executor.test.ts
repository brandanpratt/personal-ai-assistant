import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execute, undo } from '../src/executor.js';
import { latestUndoable, readJournal } from '../src/journal.js';
import { planMoves } from '../src/planner.js';
import { scan } from '../src/scanner.js';

let base: string;
let root: string;
let state: string;
const write = (rel: string, body = 'x') => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
};
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exec-')));
  root = path.join(base, 'root');
  state = path.join(base, 'state');
  fs.mkdirSync(root);
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

const run = async () => execute(root, planMoves(root, await scan(root)).moves, state);

describe('execute', () => {
  it('moves files into category folders', async () => {
    write('a.png', 'img');
    write('b.pdf', 'doc');
    const res = await run();
    expect(res.moved).toBe(2);
    expect(fs.readFileSync(path.join(root, 'Images/a.png'), 'utf8')).toBe('img');
    expect(exists('a.png')).toBe(false);
    expect(readJournal(res.journalFile).moves).toHaveLength(2);
  });

  it('never overwrites a destination that appeared after planning', async () => {
    write('a.png', 'new');
    const { moves } = planMoves(root, await scan(root));
    write('Images/a.png', 'precious'); // appears between plan and execute
    const res = execute(root, moves, state);
    expect(res.moved).toBe(0);
    expect(res.skipped[0]?.reason).toMatch(/already exists/);
    expect(fs.readFileSync(path.join(root, 'Images/a.png'), 'utf8')).toBe('precious');
    expect(exists('a.png')).toBe(true);
  });

  it('refuses moves that escape the root, even if the plan is tampered with', () => {
    const outside = path.join(base, 'outside.txt');
    fs.writeFileSync(outside, 'secret');
    const res = execute(root, [{ from: outside, to: path.join(root, 'x.txt'), category: 'Documents' }], state);
    expect(res.moved).toBe(0);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('skips one bad move and continues with the rest', async () => {
    write('a.png');
    write('b.pdf');
    const { moves } = planMoves(root, await scan(root));
    fs.rmSync(path.join(root, 'a.png')); // vanished before execution
    const res = execute(root, moves, state);
    expect(res.moved).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(exists('Documents/b.pdf')).toBe(true);
  });
});

describe('undo', () => {
  it('restores files and removes the folders it created', async () => {
    write('a.png', 'img');
    write('b.pdf', 'doc');
    const res = await run();
    const out = undo(res.journalFile);
    expect(out.restored).toBe(2);
    expect(fs.readFileSync(path.join(root, 'a.png'), 'utf8')).toBe('img');
    expect(exists('b.pdf')).toBe(true);
    expect(exists('Images')).toBe(false);
    expect(exists('Documents')).toBe(false);
  });

  it('keeps pre-existing folders and folders that now hold other files', async () => {
    write('Documents/old.pdf');
    write('a.png');
    write('b.pdf');
    const res = await run();
    write('Images/other.png'); // user adds something after the run
    undo(res.journalFile);
    expect(exists('Documents/old.pdf')).toBe(true);
    expect(exists('Images/other.png')).toBe(true);
    expect(exists('a.png')).toBe(true);
  });

  it('does not overwrite if the original spot was reoccupied', async () => {
    write('a.png', 'orig');
    const res = await run();
    write('a.png', 'replacement');
    const out = undo(res.journalFile);
    expect(out.skipped[0]?.reason).toMatch(/occupied/);
    expect(fs.readFileSync(path.join(root, 'a.png'), 'utf8')).toBe('replacement');
    expect(exists('Images/a.png')).toBe(true);
  });

  it('can only be undone once, and latestUndoable tracks that', async () => {
    write('a.png');
    const res = await run();
    expect(latestUndoable(state)).toBe(res.journalFile);
    undo(res.journalFile);
    expect(latestUndoable(state)).toBeUndefined();
    expect(() => undo(res.journalFile)).toThrow(/already been undone/);
  });
});
