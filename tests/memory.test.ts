import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Doc } from '../src/clusterText.js';
import { applyAlias, emptyMemory, learn, loadMemory, matchKnown, saveMemory } from '../src/memory.js';

const doc = (name: string): Doc => ({
  file: { path: `/r/${name}`, name, ext: 'pdf', size: 1, modified: new Date(0) },
  text: '',
  embedInput: '',
});
const vecs = (entries: Record<string, number[]>) => new Map(Object.entries(entries).map(([n, v]) => [`/r/${n}`, v]));

describe('learn', () => {
  const initial = { folders: [{ name: 'Tech Institute', docs: [doc('a'), doc('b')] }, { name: 'Bills', docs: [doc('c'), doc('d')] }], review: [] };
  const final = { folders: [{ name: 'Resumes', docs: [doc('a'), doc('b')] }, { name: 'Bills', docs: [doc('c'), doc('d')] }], review: [] };
  const v = vecs({ a: [1, 0], b: [1, 0.2], c: [0, 1], d: [0.1, 1] });

  it('remembers renames as aliases, and not unchanged names', () => {
    const m = learn(emptyMemory('m'), initial, final, v);
    expect(m.aliases).toEqual({ 'tech institute': 'Resumes' });
    expect(applyAlias(m, 'TECH INSTITUTE')).toBe('Resumes');
    expect(applyAlias(m, 'Bills')).toBe('Bills');
  });

  it('stores approved folders as centroids and matches similar vectors only', () => {
    const m = learn(emptyMemory('m'), initial, final, v);
    expect(m.folders.map((f) => f.name).sort()).toEqual(['Bills', 'Resumes']);
    expect(matchKnown(m, [1, 0.1], 0.9)).toBe('Resumes');
    expect(matchKnown(m, [0.05, 1], 0.9)).toBe('Bills');
    expect(matchKnown(m, [-1, -1], 0.5)).toBeUndefined();
  });

  it('does not learn review files or one-file folders', () => {
    const t = { folders: [{ name: 'Solo', docs: [doc('a')] }], review: [doc('b')] };
    expect(learn(emptyMemory('m'), t, t, v).folders).toEqual([]);
  });

  it('adapts a remembered centroid and accumulates counts, without mutating the input', () => {
    const m1 = learn(emptyMemory('m'), initial, final, v);
    const before = JSON.stringify(m1);
    const m2 = learn(m1, final, final, v);
    expect(JSON.stringify(m1)).toBe(before);
    expect(m2.folders.find((f) => f.name === 'Bills')!.count).toBe(4);
  });

  it('drops an alias that would point a name at itself', () => {
    const m = learn({ ...emptyMemory('m'), aliases: { bills: 'Invoices' } }, final, final, v);
    expect(m.aliases['bills']).toBe('Invoices'); // untouched: only self-references are dropped
    const loop = learn({ ...emptyMemory('m'), aliases: { bills: 'Bills' } }, final, final, v);
    expect(loop.aliases).toEqual({});
  });
});

describe('persistence', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
    file = path.join(dir, 'state', 'memory.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('round-trips and writes atomically', () => {
    const m = { ...emptyMemory('m'), folders: [{ name: 'Resumes', centroid: [1, 2], count: 3 }] };
    saveMemory(file, m);
    expect(loadMemory(file, 'm')).toEqual(m);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('starts fresh for a missing, corrupt, invalid or different-model file', () => {
    expect(loadMemory(file, 'm')).toEqual(emptyMemory('m'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');
    expect(loadMemory(file, 'm')).toEqual(emptyMemory('m'));
    fs.writeFileSync(file, JSON.stringify({ version: 1, embedModel: 'm', folders: [{ name: '../x', centroid: [], count: 1 }], aliases: {} }));
    expect(loadMemory(file, 'm')).toEqual(emptyMemory('m'));
    saveMemory(file, { ...emptyMemory('old-model'), folders: [{ name: 'Resumes', centroid: [1], count: 1 }] });
    expect(loadMemory(file, 'new-model').folders).toEqual([]);
  });
});
