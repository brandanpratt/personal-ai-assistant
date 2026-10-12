import fs from 'node:fs';
import path from 'node:path';
import { hashFile, loadTranscript, shortId } from './transcribe.js';

export const AUDIO_EXTENSIONS = new Set(['.ogg', '.opus', '.m4a', '.mp3', '.wav', '.aiff', '.aac']);

export interface Note {
  /** Short id the user and the model refer to (first 8 hex chars of the audio hash). */
  id: string;
  hash: string;
  file: string;
  name: string;
  modified: Date;
  transcribed: boolean;
}

/** Voice notes at the top level of the inbox, newest first. Skips hidden files, folders and symlinks. */
export function listInbox(inbox: string, stateDir: string): Note[] {
  let names: string[];
  try {
    names = fs.readdirSync(inbox);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const notes: Note[] = [];
  for (const name of names) {
    if (name.startsWith('.') || !AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
    const file = path.join(inbox, name);
    const st = fs.lstatSync(file);
    if (!st.isFile()) continue;
    const hash = hashFile(file);
    notes.push({ id: shortId(hash), hash, file, name, modified: st.mtime, transcribed: loadTranscript(stateDir, hash) !== undefined });
  }
  return notes.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

/** The note whose id starts with `id` (at least 4 characters). Throws a message the user can act on. */
export function findNote(notes: Note[], id: string): Note {
  const key = id.trim().toLowerCase();
  if (!/^[0-9a-f]{4,64}$/.test(key)) throw new Error(`"${id}" is not a note id. See ids with: npm run dev -- voice list`);
  const hits = notes.filter((n) => n.hash.startsWith(key));
  if (hits.length === 0) throw new Error(`No note with id ${key} in the inbox. See ids with: npm run dev -- voice list`);
  if (hits.length > 1) throw new Error(`Id ${key} matches ${hits.length} notes; use more characters.`);
  return hits[0]!;
}
