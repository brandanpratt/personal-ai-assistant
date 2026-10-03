import { extractText } from './extractor.js';
import type { FileInfo } from './scanner.js';

export const CLUSTER_THRESHOLD = 0.8;
export const MAX_CLUSTER_SIZE = 15;
/** Filename words appearing in more than this share of files carry no topic signal (e.g. the owner's name). */
const COMMON_TOKEN_SHARE = 0.06;
const NOISE = new Set(['final', 'copy', 'signed', 'draft', 'pdf', 'docx']);

const tokens = (name: string) =>
  name.replace(/\.[a-z0-9]+$/i, '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2);

export interface Doc {
  file: FileInfo;
  text: string;
  /** What gets embedded: a cleaned filename plus the extracted content. */
  embedInput: string;
}

/**
 * Builds the text to embed for each file. Filenames help, but words shared by many files
 * (your own name) and version noise ("Final", "(1)") would glue unrelated documents together,
 * so those are stripped, with "common" decided from the files being processed.
 */
export function buildDocs(entries: { file: FileInfo; text: string }[]): Doc[] {
  const df = new Map<string, number>();
  for (const e of entries) for (const t of new Set(tokens(e.file.name))) df.set(t, (df.get(t) ?? 0) + 1);
  const keep = (t: string) => !NOISE.has(t) && (df.get(t) ?? 0) / entries.length <= COMMON_TOKEN_SHARE;
  return entries.map((e) => ({
    ...e,
    embedInput: `clustering: ${tokens(e.file.name).filter(keep).join(' ')}\n${e.text}`,
  }));
}

/** Reads text from every non-sensitive readable file; files with no text are returned separately. */
export async function loadDocs(files: FileInfo[]): Promise<{ docs: Doc[]; unreadable: FileInfo[] }> {
  const entries: { file: FileInfo; text: string }[] = [];
  const unreadable: FileInfo[] = [];
  for (const file of files) {
    const text = await extractText(file);
    if (text) entries.push({ file, text });
    else unreadable.push(file);
  }
  return { docs: buildDocs(entries), unreadable };
}
