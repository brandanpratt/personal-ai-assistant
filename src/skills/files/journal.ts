import fs from 'node:fs';
import path from 'node:path';

/**
 * Append-only JSONL journal, one file per run. Records are written *before* the
 * corresponding filesystem change (write-ahead), so a crash mid-run is still undoable.
 */
export type JournalRecord =
  | { type: 'start'; id: string; root: string; at: string }
  | { type: 'move'; from: string; to: string; createdDirs: string[] }
  | { type: 'undone'; at: string };

export interface RunJournal {
  id: string;
  root: string;
  moves: Extract<JournalRecord, { type: 'move' }>[];
  undone: boolean;
}

export function createJournal(stateDir: string, root: string): { id: string; file: string } {
  const dir = path.join(stateDir, 'journals');
  fs.mkdirSync(dir, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${id}.jsonl`);
  append(file, { type: 'start', id, root, at: new Date().toISOString() });
  return { id, file };
}

export function append(file: string, record: JournalRecord): void {
  const fd = fs.openSync(file, 'a');
  try {
    fs.writeSync(fd, JSON.stringify(record) + '\n');
    fs.fsyncSync(fd); // make sure the record is on disk before we act on it
  } finally {
    fs.closeSync(fd);
  }
}

export function readJournal(file: string): RunJournal {
  const records = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalRecord);
  const start = records[0];
  if (start?.type !== 'start') throw new Error(`Corrupt journal (no start record): ${file}`);
  return {
    id: start.id,
    root: start.root,
    moves: records.filter((r): r is Extract<JournalRecord, { type: 'move' }> => r.type === 'move'),
    undone: records.some((r) => r.type === 'undone'),
  };
}

/** Path of the most recent journal that has not been undone, or undefined. */
export function latestUndoable(stateDir: string): string | undefined {
  const dir = path.join(stateDir, 'journals');
  if (!fs.existsSync(dir)) return undefined;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .reverse()
    .map((f) => path.join(dir, f))
    .find((f) => !readJournal(f).undone);
}
