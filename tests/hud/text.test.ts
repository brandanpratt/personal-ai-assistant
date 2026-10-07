import { describe, expect, it } from 'vitest';
import { cleanText, replyVisibleMs, speakMs } from '../../hud/shared/text.js';

describe('cleanText', () => {
  it('removes terminal escapes and bidi overrides but keeps line breaks', () => {
    const dirty = 'safe\u001b[2Jtext\u202Eevil\u202C\nnext line';
    const out = cleanText(dirty);
    expect(out).not.toMatch(/[\u001b\u202E\u202C]/);
    expect(out).toContain('\n');
    expect(out).toContain('next line');
  });

  it('collapses runs of blank lines and trims', () => {
    expect(cleanText('  a\n\n\n\n\nb  ')).toBe('a\n\nb');
  });

  it('normalizes Windows line endings', () => {
    expect(cleanText('a\r\nb')).toBe('a\nb');
  });

  it('caps the length with an ellipsis', () => {
    const out = cleanText('x'.repeat(100), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('durations', () => {
  it('gives short replies a minimum and long replies a cap', () => {
    expect(speakMs('hi')).toBe(1200);
    expect(speakMs('x'.repeat(10_000))).toBe(6000);
    expect(replyVisibleMs('')).toBe(8000);
    expect(replyVisibleMs('x'.repeat(100_000))).toBe(60_000);
  });
});
