import fs from 'node:fs';
import path from 'node:path';
import { append, createJournal, readJournal } from './journal.js';
import { resolveInside } from '../../core/safety/pathGuard.js';
import type { Move } from './planner.js';
import { errorMessage } from '../../core/util.js';

export interface ExecResult {
  journalFile: string;
  moved: number;
  skipped: { move: { from: string; to: string }; reason: string }[];
}

/** Creates missing directories one level at a time, returning those we created (for undo). */
function mkdirTracked(root: string, dir: string): string[] {
  const created: string[] = [];
  const missing: string[] = [];
  for (let cur = dir; !fs.existsSync(cur); cur = path.dirname(cur)) missing.push(cur);
  for (const d of missing.reverse()) {
    resolveInside(root, d);
    fs.mkdirSync(d);
    created.push(d);
  }
  return created;
}

/**
 * Moves a file without ever overwriting: hard-link to the new name (fails with EEXIST
 * if taken), then remove the old name. Unlike rename(), this can't clobber a file.
 */
function safeMove(from: string, to: string): void {
  fs.linkSync(from, to);
  fs.unlinkSync(from);
}

/** Applies moves in order. Every path is re-validated at execution time, not trusted from the plan. */
export function execute(root: string, moves: Move[], stateDir: string): ExecResult {
  const { file: journalFile } = createJournal(stateDir, root);
  const result: ExecResult = { journalFile, moved: 0, skipped: [] };

  for (const m of moves) {
    const skip = (reason: string) => result.skipped.push({ move: { from: m.from, to: m.to }, reason });
    try {
      const from = resolveInside(root, m.from);
      const to = resolveInside(root, m.to);
      if (!fs.lstatSync(from).isFile()) throw new Error('source is not a regular file');
      if (fs.existsSync(to)) throw new Error('destination already exists');

      const createdDirs = mkdirTracked(root, path.dirname(to));
      append(journalFile, { type: 'move', from, to, createdDirs }); // write-ahead
      safeMove(from, to);
      result.moved++;
    } catch (err) {
      skip(errorMessage(err));
    }
  }
  return result;
}

export interface UndoResult {
  restored: number;
  skipped: { from: string; to: string; reason: string }[];
}

/** Reverses a journal, newest move first. Never overwrites, and removes only directories we created if empty. */
export function undo(journalFile: string): UndoResult {
  const journal = readJournal(journalFile);
  if (journal.undone) throw new Error('This run has already been undone');
  const result: UndoResult = { restored: 0, skipped: [] };

  for (const m of [...journal.moves].reverse()) {
    try {
      const from = resolveInside(journal.root, m.from);
      const to = resolveInside(journal.root, m.to);
      if (!fs.existsSync(to)) throw new Error('moved file no longer at destination (or move never happened)');
      if (fs.existsSync(from)) throw new Error('original location is occupied');
      safeMove(to, from);
      result.restored++;
      for (const dir of [...m.createdDirs].reverse()) {
        try {
          fs.rmdirSync(dir); // throws if non-empty, which is what we want
        } catch {
          /* leave it */
        }
      }
    } catch (err) {
      result.skipped.push({ from: m.from, to: m.to, reason: errorMessage(err) });
    }
  }
  append(journalFile, { type: 'undone', at: new Date().toISOString() });
  return result;
}
