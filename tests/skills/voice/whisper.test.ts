import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseWhisperJson, runWhisper, toWords } from '../../../src/skills/voice/whisper.js';
import { makeTempDir, removeDir } from '../../helpers/fs.js';
import { fakeRun, fixtureJson } from './helpers.js';

let dir: string | undefined;
afterEach(() => dir && removeDir(dir));

describe('whisper output parsing', () => {
  it('joins subword tokens into words, skips timing tokens, and keeps the lowest confidence', () => {
    const words = toWords([
      { text: '[_BEG_]', p: 1 },
      { text: ' say', p: 0.9 },
      { text: 'in', p: 0.4 },
      { text: ',', p: 0.95 },
      { text: ' bey', p: 0.7 },
    ], 0.5);
    expect(words).toEqual([
      { text: 'sayin,', p: 0.4, uncertain: true },
      { text: 'bey', p: 0.7, uncertain: false },
    ]);
  });

  it('drops blank, non-speech and repeated segments', () => {
    const segs = parseWhisperJson(fixtureJson(), 0.5);
    expect(segs.map((s) => s.text)).toEqual(['Wha you sayin, bey?', 'I comin later.']);
    expect(segs[0]!.words.filter((w) => w.uncertain).map((w) => w.text)).toEqual(['Wha', 'sayin,']);
    expect(segs[1]).toMatchObject({ fromMs: 4000, toMs: 6100 });
  });

  it('rejects output in an unexpected shape', () => {
    expect(() => parseWhisperJson({ nope: true }, 0.5)).toThrow(/expected JSON/);
  });

  it('runs whisper-cli with English, full JSON output and an optional vocabulary prompt', async () => {
    dir = makeTempDir('whisper');
    const { run, calls } = fakeRun();
    const segs = await runWhisper({ run, bin: 'whisper-cli', model: '/m/ggml.bin', uncertainP: 0.5, prompt: 'bey, wha' }, path.join(dir, 'a.wav'), dir);
    expect(segs).toHaveLength(2);
    expect(calls[0]!.args).toEqual(['-m', '/m/ggml.bin', '-f', path.join(dir, 'a.wav'), '-l', 'en', '-ojf', '-of', path.join(dir, 'whisper'), '-np', '--prompt', 'bey, wha']);
  });

  it('fails clearly when whisper writes nothing', async () => {
    dir = makeTempDir('whisper');
    const run = async () => ({ stdout: '', stderr: '' });
    await expect(runWhisper({ run, bin: 'w', model: 'm', uncertainP: 0.5 }, 'a.wav', dir)).rejects.toThrow(/no JSON/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
