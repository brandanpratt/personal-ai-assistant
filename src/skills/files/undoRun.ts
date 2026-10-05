import { undo, type UndoResult } from './executor.js';
import { hasMemorySnapshot, restoreMemoryBeforeRun } from './memory.js';

export interface UndoRunResult extends UndoResult {
  /** forgot: folders learned in that run were removed. kept: undo was partial, so they were kept. none: the run learned nothing. */
  memory: 'forgot' | 'kept' | 'none';
}

/**
 * Undoes a run's file moves and, if everything was restored, also forgets the folders the agent
 * learned from that run. If some files couldn't be restored the learning is kept, because those
 * files are still sitting in the folders it learned.
 */
export function undoRun(journalFile: string, memoryFile: string): UndoRunResult {
  const res = undo(journalFile);
  if (!hasMemorySnapshot(journalFile)) return { ...res, memory: 'none' };
  if (res.skipped.length > 0) return { ...res, memory: 'kept' };
  restoreMemoryBeforeRun(memoryFile, journalFile);
  return { ...res, memory: 'forgot' };
}

export function describeUndo(r: UndoRunResult): string {
  const note = { forgot: ' Forgot the folders learned in that run.', kept: ' Some files could not be restored, so the folders learned in that run were kept.', none: '' }[r.memory];
  return `Restored ${r.restored}, skipped ${r.skipped.length}.${note}`;
}
