import path from 'node:path';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planMoves } from '../../../src/skills/files/planner.js';
import { applyEdit, parseCommand, toPlacement } from '../../../src/skills/files/review.js';
import { scan } from '../../../src/skills/files/scanner.js';
import type { Taxonomy } from '../../../src/skills/files/taxonomy.js';
import { makeTempDir, removeDir } from '../../helpers/fs.js';
import { makeDoc } from '../../helpers/docs.js';

const doc = (name: string) => makeDoc(name);
const tax = (): Taxonomy => ({
  folders: [
    { name: 'Resumes', docs: [doc('a.pdf'), doc('b.pdf')] },
    { name: 'Resumes 2', docs: [doc('c.pdf')] },
    { name: 'Invoices', docs: [doc('d.pdf')] },
  ],
  review: [doc('e.pdf')],
});
const ok = (r: ReturnType<typeof applyEdit>) => {
  if (!r.ok) throw new Error(r.error);
  return r.taxonomy;
};

describe('parseCommand', () => {
  it('parses valid commands and returns usage text otherwise', () => {
    expect(parseCommand('rename 2 Leave Forms')).toEqual({ kind: 'rename', n: 2, name: 'Leave Forms' });
    expect(parseCommand('merge 2 1')).toEqual({ kind: 'merge', from: 2, into: 1 });
    expect(parseCommand('DONE')).toEqual({ kind: 'done' });
    expect(typeof parseCommand('merge 2')).toBe('string');
    expect(typeof parseCommand('rename 2')).toBe('string');
    expect(typeof parseCommand('nonsense')).toBe('string');
  });
});

describe('applyEdit', () => {
  it('merges one folder into another', () => {
    const t = ok(applyEdit(tax(), { kind: 'merge', from: 2, into: 1 }));
    expect(t.folders.map((f) => f.name)).toEqual(['Resumes', 'Invoices']);
    expect(t.folders[0]!.docs).toHaveLength(3);
  });

  it('renames, and renaming onto an existing name merges', () => {
    expect(ok(applyEdit(tax(), { kind: 'rename', n: 3, name: 'Bills' })).folders[2]!.name).toBe('Bills');
    const merged = ok(applyEdit(tax(), { kind: 'rename', n: 2, name: 'resumes' }));
    expect(merged.folders.map((f) => f.name)).toEqual(['Resumes', 'Invoices']);
  });

  it('rejects unsafe or generic names and bad folder numbers', () => {
    for (const name of ['../x', 'a/b', 'Misc', '_review'])
      expect(applyEdit(tax(), { kind: 'rename', n: 1, name }).ok).toBe(false);
    expect(applyEdit(tax(), { kind: 'reject', n: 9 }).ok).toBe(false);
    expect(applyEdit(tax(), { kind: 'merge', from: 1, into: 1 }).ok).toBe(false);
  });

  it('reject moves a folder\'s files to review without losing any', () => {
    const t = ok(applyEdit(tax(), { kind: 'reject', n: 3 }));
    expect(t.folders).toHaveLength(2);
    expect(t.review.map((d) => d.file.name)).toEqual(['e.pdf', 'd.pdf']);
  });

  it('does not mutate the input taxonomy', () => {
    const t = tax();
    applyEdit(t, { kind: 'merge', from: 2, into: 1 });
    expect(t.folders).toHaveLength(3);
  });
});

describe('topic-aware planMoves', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempDir('topic');
  });
  afterEach(() => removeDir(root));

  it('nests topic folders inside type folders and sends review files to _review', async () => {
    for (const n of ['cv.pdf', 'bill.pdf', 'weird.pdf', 'pic.png']) fs.writeFileSync(path.join(root, n), 'x');
    const files = await scan(root);
    const p = (n: string) => files.find((f) => f.name === n)!.path;
    const placement = toPlacement({
      folders: [
        { name: 'Resumes', docs: [{ ...doc('cv.pdf'), file: files.find((f) => f.name === 'cv.pdf')! }] },
        { name: 'Invoices', docs: [{ ...doc('bill.pdf'), file: files.find((f) => f.name === 'bill.pdf')! }] },
      ],
      review: [{ ...doc('weird.pdf'), file: files.find((f) => f.name === 'weird.pdf')! }],
    });
    const rel = planMoves(root, files, placement).moves.map((m) => path.relative(root, m.to)).sort();
    expect(rel).toEqual(['Documents/Invoices/bill.pdf', 'Documents/Resumes/cv.pdf', 'Documents/_review/weird.pdf', 'Images/pic.png']);
    expect(p('pic.png')).toBeTruthy();
  });

  it('without placement behaves exactly as before', async () => {
    fs.writeFileSync(path.join(root, 'a.pdf'), 'x');
    const rel = planMoves(root, await scan(root)).moves.map((m) => path.relative(root, m.to));
    expect(rel).toEqual(['Documents/a.pdf']);
  });
});
