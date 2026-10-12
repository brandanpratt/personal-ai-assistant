import { describe, expect, it } from 'vitest';
import { align, normalizeWords, wordErrorRate } from '../../../src/skills/voice/wer.js';

describe('word error rate', () => {
  it('normalizes case and punctuation but keeps apostrophes inside words', () => {
    expect(normalizeWords("Wha' you SAYIN, bey? Y’all ain't ready!")).toEqual(['wha', 'you', 'sayin', 'bey', "y'all", "ain't", 'ready']);
  });

  it('is 0 for a perfect transcript', () => {
    expect(wordErrorRate('I comin later.', 'i comin later')).toMatchObject({ wer: 0, errors: 0, refWords: 3 });
  });

  it('counts substitutions, deletions and insertions against the words said', () => {
    const r = wordErrorRate('wha you sayin bey', 'what you saying');
    expect(r.ops).toEqual([
      { type: 'sub', ref: 'wha', hyp: 'what' },
      { type: 'ok', ref: 'you', hyp: 'you' },
      { type: 'sub', ref: 'sayin', hyp: 'saying' },
      { type: 'del', ref: 'bey' },
    ]);
    expect(r.wer).toBe(0.75);
    expect(align(['a'], ['a', 'b'])).toEqual([{ type: 'ok', ref: 'a', hyp: 'a' }, { type: 'ins', hyp: 'b' }]);
  });

  it('handles empty references', () => {
    expect(wordErrorRate('', '').wer).toBe(0);
    expect(wordErrorRate('', 'thank you').wer).toBe(1);
  });
});
