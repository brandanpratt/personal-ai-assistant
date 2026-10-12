import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findPairs, formatBaseline, summarize } from '../../../src/skills/voice/baseline.js';
import { makeTempDir, removeDir, writeFile } from '../../helpers/fs.js';

let dir: string | undefined;
afterEach(() => dir && removeDir(dir));

describe('voice baseline', () => {
  it('pairs each audio file with its same-name .txt and lists the ones without', () => {
    dir = makeTempDir('baseline');
    writeFile(dir, 'a.opus');
    writeFile(dir, 'a.txt', 'said');
    writeFile(dir, 'b.ogg');
    writeFile(dir, 'notes.txt');
    expect(findPairs(dir)).toEqual({ pairs: [{ audio: path.join(dir, 'a.opus'), reference: path.join(dir, 'a.txt') }], missing: ['b.ogg'] });
  });

  it('pools the error rate over all notes and ranks the most-missed words', () => {
    const s = summarize([
      { name: 'a', reference: 'wha you sayin bey', hypothesis: 'what you saying' },
      { name: 'b', reference: 'bey I comin', hypothesis: 'bay I coming' },
    ]);
    expect(s.overallWer).toBeCloseTo(5 / 7);
    expect(s.missed[0]).toEqual({ word: 'bey', count: 2, heardAs: ['', 'bay'] });
    const md = formatBaseline(s, 'ggml-large-v3.bin', new Date('2026-10-11T12:00:00Z'));
    expect(md).toContain('Overall word error rate: **71.4%**');
    expect(md).toContain('| a | 4 | 3 | 75.0% |');
    expect(md).toContain('- **bey** ×2: Whisper wrote (dropped), "bay"');
  });
});
