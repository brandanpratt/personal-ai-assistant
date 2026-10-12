import { describe, expect, it } from 'vitest';
import { clean, formatDuration, formatTranscript } from '../../../src/skills/voice/format.js';
import type { Transcript } from '../../../src/skills/voice/transcribe.js';
import { parseWhisperJson } from '../../../src/skills/voice/whisper.js';
import { fixtureJson } from './helpers.js';

const transcript = (over: Partial<Transcript> = {}): Transcript => ({
  hash: 'abcdef0123456789', model: 'm.bin', source: 'PTT-1.opus', transcribedAt: '2026-10-11T00:00:00Z',
  segments: parseWhisperJson(fixtureJson(), 0.5), ...over,
});

describe('voice formatting', () => {
  it('shows the raw transcript with unsure words marked', () => {
    const out = formatTranscript(transcript());
    expect(out).toContain('Note abcdef01 · PTT-1.opus · 0:06');
    expect(out).toContain('0:00  [?Wha] you [?sayin,] bey?');
    expect(out).toContain('0:04  I comin later.');
    expect(out).toContain('[?word] = Whisper was unsure');
  });

  it('says when there was no speech', () => {
    expect(formatTranscript(transcript({ segments: [] }))).toContain('(no speech found)');
  });

  it('strips terminal escape and bidi characters from untrusted text', () => {
    expect(clean('a\u001b[2Jb‮c')).toBe('a [2Jb c');
    expect(clean('x'.repeat(10), 5)).toBe('xxxx…');
    expect(formatDuration(61_400)).toBe('1:01');
  });
});
