import { describe, expect, it } from 'vitest';
import type { Doc } from '../../../src/skills/files/clusterText.js';
import { buildPrompt, createNamer, parseNameResponse } from '../../../src/skills/files/namer.js';
import { buildTaxonomy, type NameFn } from '../../../src/skills/files/taxonomy.js';

const doc = (name: string): Doc => ({
  file: { path: `/x/${name}`, name, ext: 'pdf', size: 1, modified: new Date(0) },
  text: `text of ${name}`,
  embedInput: name,
});

describe('parseNameResponse', () => {
  it('accepts a valid reply', () => {
    expect(parseNameResponse('{"folder":"Leave Forms","reason":"HR forms"}')).toBe('Leave Forms');
  });
  it.each([
    ['not json'],
    ['{"folder":"../etc","reason":"x"}'],
    ['{"folder":"a/b","reason":"x"}'],
    ['{"folder":"Misc","reason":"x"}'],
    ['{"folder":"_review","reason":"x"}'],
    ['{"folder":"","reason":"x"}'],
    [JSON.stringify({ folder: 'x'.repeat(50), reason: 'too long' })],
    ['{"reason":"no folder"}'],
  ])('rejects unusable reply %s', (raw) => expect(parseNameResponse(raw)).toBeUndefined());
});

describe('createNamer', () => {
  const sample = [doc('a.pdf')];
  it('retries once after an invalid reply, then succeeds', async () => {
    const replies = ['garbage', '{"folder":"Invoices","reason":"r"}'];
    const namer = createNamer(async () => replies.shift()!);
    expect(await namer(sample, [])).toBe('Invoices');
  });
  it('gives up after repeated invalid replies or errors', async () => {
    expect(await createNamer(async () => 'garbage')(sample, [])).toBeUndefined();
    expect(await createNamer(async () => { throw new Error('ollama down'); })(sample, [])).toBeUndefined();
  });
  it('tells the model about existing folders', () => {
    expect(buildPrompt(sample, ['Resumes'])).toContain('Existing folders: Resumes');
  });
});

describe('buildTaxonomy', () => {
  // two tight topics, a near-duplicate topic that should merge by name, a stray, and an outlier
  const docs = ['r1', 'r2', 'r3', 'r4', 'i1', 'i2', 'stray', 'far'].map(doc);
  const vectors = [
    [1, 0.02], [1, 0], [0.97, 0.2], [0.97, 0.25], // resumes (two close sub-groups)
    [0, 1], [0.05, 1],                            // invoices
    [0.9, 0.35],                                  // singleton near resumes
    [-1, -1],                                     // singleton far from everything
  ];
  const nameFn: NameFn = async (sample) => (sample[0]!.file.name.startsWith('r') ? 'Resumes' : 'Invoices');

  it('names folders, merges same-named clusters, attaches near singletons, reviews far ones', async () => {
    const t = await buildTaxonomy(docs, vectors, nameFn, { minFit: 0.5, attachThreshold: 0.9 });
    const byName = Object.fromEntries(t.folders.map((f) => [f.name, f.docs.map((d) => d.file.name)]));
    expect(byName['Resumes']).toEqual(expect.arrayContaining(['r1', 'r2', 'r3', 'r4', 'stray']));
    expect(byName['Invoices']).toEqual(['i1', 'i2']);
    expect(t.review.map((d) => d.file.name)).toEqual(['far']);
  });

  it('does not merge dissimilar clusters just because the model reused a name', async () => {
    const t = await buildTaxonomy(docs, vectors, async () => 'Everything', { minFit: 0.0 });
    const names = t.folders.map((f) => f.name).sort();
    expect(names.length).toBeGreaterThan(1);
    expect(names).toContain('Everything');
    expect(names.some((n) => n.startsWith('Everything 2'))).toBe(true);
  });

  it('sends a whole cluster to review when naming fails', async () => {
    const t = await buildTaxonomy(docs, vectors, async () => undefined);
    expect(t.folders).toEqual([]);
    expect(t.review).toHaveLength(docs.length);
  });

  it('every file lands in exactly one place', async () => {
    const t = await buildTaxonomy(docs, vectors, nameFn);
    const all = [...t.folders.flatMap((f) => f.docs), ...t.review].map((d) => d.file.name).sort();
    expect(all).toEqual(docs.map((d) => d.file.name).sort());
  });
});
