import { describe, expect, it } from 'vitest';
import { buildDocs } from '../../../src/skills/files/clusterText.js';
import type { FileInfo } from '../../../src/skills/files/scanner.js';

const f = (name: string): { file: FileInfo; text: string } => ({
  file: { path: `/x/${name}`, name, ext: name.split('.').pop()!, size: 1, modified: new Date(0) },
  text: 'body',
});

describe('buildDocs', () => {
  it('drops words shared by many files, version noise and extensions, keeps topical words', () => {
    const names = Array.from({ length: 20 }, (_, i) => `Jane Doe report${i} (1).pdf`);
    names.push('Jane Doe Invoice Final.pdf');
    const docs = buildDocs(names.map(f));
    const inv = docs[20]!.embedInput;
    expect(inv.startsWith('clustering: ')).toBe(true);
    expect(inv).toContain('invoice');
    expect(inv).not.toMatch(/jane|doe|final|pdf/);
    expect(inv).toContain('\nbody');
  });
});
