import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { centroid, cosineSimilarity } from '../../core/ai/cluster.js';
import { readJson, writeJsonAtomic } from '../../core/util.js';
import { FolderName, folderKey } from './namer.js';
import type { Taxonomy } from './taxonomy.js';

/**
 * What the agent remembers between runs. No file contents are stored: only the folders you
 * approved (as an average embedding vector plus a count) and your renames.
 */
export const MemorySchema = z.object({
  version: z.literal(1),
  /** Vectors from different embedding models are not comparable, so memory is tied to one. */
  embedModel: z.string(),
  folders: z.array(z.object({ name: FolderName, centroid: z.array(z.number()), count: z.number().int().positive() })),
  /** lowercased name the model proposed -> name you chose instead */
  aliases: z.record(z.string(), FolderName),
});
export type Memory = z.infer<typeof MemorySchema>;

/** After this many files a folder's centroid keeps adapting instead of freezing. */
const MAX_WEIGHT = 50;
export const MEMORY_FILE = 'memory.json';
export const memoryFilePath = (stateDir: string) => path.join(stateDir, MEMORY_FILE);

export const emptyMemory = (embedModel: string): Memory => ({ version: 1, embedModel, folders: [], aliases: {} });

/** Never throws: a missing, corrupt or mismatched memory file just means starting fresh. */
export function loadMemory(file: string, embedModel: string): Memory {
  const parsed = MemorySchema.safeParse(readJson(file));
  if (parsed.success && parsed.data.embedModel === embedModel) return parsed.data;
  return emptyMemory(embedModel);
}

/** Atomic write: a crash mid-save can't leave a half-written memory file. */
export function saveMemory(file: string, memory: Memory): void {
  writeJsonAtomic(file, MemorySchema.parse(memory));
}

/** The remembered folder whose centroid is most similar to `vector`, if similar enough. */
export function matchKnown(memory: Memory, vector: number[], threshold: number): string | undefined {
  let best: { name: string; sim: number } | undefined;
  for (const f of memory.folders) {
    if (f.centroid.length !== vector.length) continue;
    const sim = cosineSimilarity(vector, f.centroid);
    if (!best || sim > best.sim) best = { name: f.name, sim };
  }
  return best && best.sim >= threshold ? best.name : undefined;
}

export const applyAlias = (memory: Memory, name: string): string => memory.aliases[folderKey(name)] ?? name;

/**
 * Pure: returns updated memory after you approved `final`.
 * - Renames: if files proposed under "X" ended up in "Y", remember X -> Y.
 * - Folders: fold each approved folder's files into its remembered centroid (running average).
 *   Folders of fewer than 2 files and the review pile are not learned.
 */
export function learn(memory: Memory, initial: Taxonomy, final: Taxonomy, vectors: Map<string, number[]>): Memory {
  const initialName = new Map<string, string>();
  for (const f of initial.folders) for (const d of f.docs) initialName.set(d.file.path, f.name);

  const tally = new Map<string, Map<string, number>>();
  for (const f of final.folders) {
    for (const d of f.docs) {
      const was = initialName.get(d.file.path);
      if (!was || folderKey(was) === folderKey(f.name)) continue;
      const inner = tally.get(folderKey(was)) ?? new Map<string, number>();
      inner.set(f.name, (inner.get(f.name) ?? 0) + 1);
      tally.set(folderKey(was), inner);
    }
  }
  const aliases = { ...memory.aliases };
  for (const [from, targets] of tally) {
    const [target] = [...targets].sort((a, b) => b[1] - a[1])[0]!;
    aliases[from] = target;
  }
  for (const [from, to] of Object.entries(aliases)) if (folderKey(to) === from) delete aliases[from];

  const folders = memory.folders.map((f) => ({ ...f }));
  for (const f of final.folders) {
    const vecs = f.docs.map((d) => vectors.get(d.file.path)).filter((v): v is number[] => !!v);
    if (vecs.length < 2) continue;
    const fresh = centroid(vecs);
    const old = folders.find((x) => folderKey(x.name) === folderKey(f.name));
    if (!old) {
      folders.push({ name: f.name, centroid: fresh, count: vecs.length });
    } else if (old.centroid.length === fresh.length) {
      const w = Math.min(old.count, MAX_WEIGHT);
      old.centroid = old.centroid.map((x, i) => (x * w + fresh[i]! * vecs.length) / (w + vecs.length));
      old.count += vecs.length;
    }
  }
  return { ...memory, folders, aliases };
}

const snapshotPath = (journalFile: string) => journalFile.replace(/\.jsonl$/, '.memory-before.json');

export const hasMemorySnapshot = (journalFile: string) => fs.existsSync(snapshotPath(journalFile));

/**
 * Saves `after` as the new memory, first recording `before` next to the run's journal so that
 * undoing the run can restore it. The snapshot is written first: a crash in between is harmless.
 */
export function saveLearnedMemory(memoryFile: string, journalFile: string, before: Memory, after: Memory): void {
  const empty = before.folders.length === 0 && Object.keys(before.aliases).length === 0;
  writeJsonAtomic(snapshotPath(journalFile), { before: empty ? null : MemorySchema.parse(before) });
  saveMemory(memoryFile, after);
}

/** Restores the memory from before the run (deleting the file if there was none). False if the run learned nothing. */
export function restoreMemoryBeforeRun(memoryFile: string, journalFile: string): boolean {
  const snap = snapshotPath(journalFile);
  const snapshot = readJson(snap) as { before?: unknown } | undefined;
  if (!snapshot || !('before' in snapshot)) return false;
  const { before } = snapshot;
  if (before === null) fs.rmSync(memoryFile, { force: true });
  else saveMemory(memoryFile, MemorySchema.parse(before));
  fs.rmSync(snap, { force: true });
  return true;
}
