import { FolderName, folderKey } from './namer.js';
import type { Taxonomy } from './taxonomy.js';

export type Command =
  | { kind: 'list' }
  | { kind: 'show'; n: number }
  | { kind: 'rename'; n: number; name: string }
  | { kind: 'merge'; from: number; into: number }
  | { kind: 'reject'; n: number }
  | { kind: 'done' };

export function parseCommand(line: string): Command | string {
  const [verb, a, b, ...rest] = line.trim().split(/\s+/);
  const num = (x?: string) => (x && /^\d+$/.test(x) ? Number(x) : undefined);
  switch (verb?.toLowerCase()) {
    case 'list': return { kind: 'list' };
    case 'done': return { kind: 'done' };
    case 'show': return num(a) ? { kind: 'show', n: num(a)! } : 'usage: show <n>';
    case 'reject': return num(a) ? { kind: 'reject', n: num(a)! } : 'usage: reject <n>';
    case 'merge': return num(a) && num(b) ? { kind: 'merge', from: num(a)!, into: num(b)! } : 'usage: merge <from> <into>';
    case 'rename': {
      const name = [b, ...rest].filter(Boolean).join(' ');
      return num(a) && name ? { kind: 'rename', n: num(a)!, name } : 'usage: rename <n> <new name>';
    }
    default: return 'commands: list | show <n> | rename <n> <name> | merge <from> <into> | reject <n> | done';
  }
}

export type EditResult = { ok: true; taxonomy: Taxonomy } | { ok: false; error: string };

/** Applies a rename/merge/reject (1-based folder numbers). Pure: returns a new taxonomy. */
export function applyEdit(t: Taxonomy, cmd: Extract<Command, { kind: 'rename' | 'merge' | 'reject' }>): EditResult {
  const at = (n: number) => t.folders[n - 1];
  const fail = (error: string): EditResult => ({ ok: false, error });
  const without = (...idx: number[]) => t.folders.filter((_, i) => !idx.includes(i));

  if (cmd.kind === 'reject') {
    const f = at(cmd.n);
    if (!f) return fail(`no folder ${cmd.n}`);
    return { ok: true, taxonomy: { folders: without(cmd.n - 1), review: [...t.review, ...f.docs] } };
  }
  if (cmd.kind === 'merge') {
    const from = at(cmd.from), into = at(cmd.into);
    if (!from || !into) return fail('no such folder');
    if (cmd.from === cmd.into) return fail('cannot merge a folder into itself');
    const merged = { name: into.name, docs: [...into.docs, ...from.docs] };
    const folders = t.folders.map((f, i) => (i === cmd.into - 1 ? merged : f)).filter((_, i) => i !== cmd.from - 1);
    return { ok: true, taxonomy: { ...t, folders } };
  }
  const f = at(cmd.n);
  if (!f) return fail(`no folder ${cmd.n}`);
  const parsed = FolderName.safeParse(cmd.name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid name');
  const target = parsed.data;
  const existing = t.folders.findIndex((x, i) => i !== cmd.n - 1 && folderKey(x.name) === folderKey(target));
  if (existing >= 0) return applyEdit(t, { kind: 'merge', from: cmd.n, into: existing + 1 }); // renaming onto an existing name merges
  return { ok: true, taxonomy: { ...t, folders: t.folders.map((x, i) => (i === cmd.n - 1 ? { ...x, name: target } : x)) } };
}

/** Maps each filed document to its topic subfolder; review files go to "_review". */
export function toPlacement(t: Taxonomy): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of t.folders) for (const d of f.docs) m.set(d.file.path, f.name);
  for (const d of t.review) m.set(d.file.path, '_review');
  return m;
}

export function formatTaxonomy(t: Taxonomy, remembered: ReadonlySet<string> = new Set()): string {
  const lines = t.folders.map(
    (f, i) => `${String(i + 1).padStart(3)}. ${f.name} (${f.docs.length})${remembered.has(folderKey(f.name)) ? '  [remembered]' : ''}`,
  );
  lines.push('', `Review (${t.review.length}): files we weren't confident about go to _review`);
  return lines.join('\n');
}
