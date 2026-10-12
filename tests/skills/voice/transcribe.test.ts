import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transcribeFile, transcriptText, type TranscribeDeps } from '../../../src/skills/voice/transcribe.js';
import { makeTempDir, removeDir, writeFile } from '../../helpers/fs.js';
import { fakeRun } from './helpers.js';

let base: string, note: string, state: string;
beforeEach(() => {
  base = makeTempDir('transcribe');
  state = path.join(base, 'state');
  writeFile(base, 'inbox/PTT-1.opus', 'fake audio');
  note = path.join(base, 'inbox/PTT-1.opus');
});
afterEach(() => removeDir(base));

const deps = (run: TranscribeDeps['run'], model = '/models/ggml-large-v3.bin'): TranscribeDeps => ({
  stateDir: state, run, ffmpeg: 'ffmpeg', whisperBin: 'whisper-cli', whisperModel: model, uncertainP: 0.5,
});

describe('transcribeFile', () => {
  it('converts with ffmpeg, runs whisper, and leaves the original untouched', async () => {
    const { run, calls } = fakeRun();
    const { transcript, cached } = await transcribeFile(deps(run), note);
    expect(cached).toBe(false);
    expect(transcriptText(transcript)).toBe('Wha you sayin, bey? I comin later.');
    expect(transcript).toMatchObject({ model: 'ggml-large-v3.bin', source: 'PTT-1.opus' });
    expect(calls.map((c) => c.bin)).toEqual(['ffmpeg', 'whisper-cli']);
    expect(calls[0]!.args).toContain(note);
    expect(fs.readFileSync(note, 'utf8')).toBe('fake audio');
    // the temp work folder is cleaned up
    expect(fs.existsSync(path.dirname(calls[0]!.args.at(-1)!))).toBe(false);
  });

  it('caches by audio content: a second run, even after a rename, does not call whisper', async () => {
    const { run, calls } = fakeRun();
    await transcribeFile(deps(run), note);
    const renamed = path.join(base, 'inbox/renamed.opus');
    fs.renameSync(note, renamed);
    const again = await transcribeFile(deps(run), renamed);
    expect(again.cached).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('re-transcribes with a different model or --force', async () => {
    const { run, calls } = fakeRun();
    await transcribeFile(deps(run), note);
    expect((await transcribeFile(deps(run, '/models/ggml-large-v3-turbo.bin'), note)).cached).toBe(false);
    expect((await transcribeFile(deps(run, '/models/ggml-large-v3-turbo.bin'), note, { force: true })).cached).toBe(false);
    expect(calls).toHaveLength(6);
  });

  it('does not cache a failed run', async () => {
    const failing: TranscribeDeps['run'] = async () => { throw new Error('ffmpeg failed'); };
    await expect(transcribeFile(deps(failing), note)).rejects.toThrow(/ffmpeg failed/);
    expect(fs.existsSync(path.join(state, 'transcripts'))).toBe(false);
  });
});
