import { execute, type ExecResult } from './executor.js';
import { learn, loadMemory, memoryFilePath, saveLearnedMemory } from './memory.js';
import type { Proposal } from './organize.js';
import type { Move } from './planner.js';
import type { Taxonomy } from './taxonomy.js';

/** The reviewed proposal behind a plan, so the agent can learn from it once it has run. */
export interface Learned {
  proposal: Proposal;
  taxonomy: Taxonomy;
}

export const moveQuestion = (count: number, root: string) => `\nMove ${count} files in ${root}?`;

/**
 * Runs already-approved moves. If they came from a reviewed topic proposal, also remembers those
 * folders, but only when something actually moved. Used by both the CLI and the chat tools so
 * they can never disagree about what gets learned.
 */
export function executeAndLearn(o: {
  root: string;
  moves: Move[];
  stateDir: string;
  embedModel: string;
  learned?: Learned;
}): ExecResult & { learnedFolders: boolean } {
  const res = execute(o.root, o.moves, o.stateDir);
  if (res.moved === 0 || !o.learned) return { ...res, learnedFolders: false };
  const file = memoryFilePath(o.stateDir);
  const before = loadMemory(file, o.embedModel);
  const { proposal, taxonomy } = o.learned;
  saveLearnedMemory(file, res.journalFile, before, learn(before, proposal.taxonomy, taxonomy, proposal.vectors));
  return { ...res, learnedFolders: true };
}
