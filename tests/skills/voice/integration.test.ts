import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadVoiceConfig } from '../../../src/skills/voice/config.js';
import { findExecutable, runBinary } from '../../../src/skills/voice/run.js';
import { transcribeFile, transcriptText } from '../../../src/skills/voice/transcribe.js';
import { makeTempDir, removeDir } from '../../helpers/fs.js';

/**
 * Real ffmpeg + whisper.cpp on synthetic speech from macOS `say`. Runs only when the tools and
 * WHISPER_MODEL are set up. It proves the pipeline works, not that it understands dialect.
 */
const cfg = loadVoiceConfig();
const ready = !!(findExecutable('say') && findExecutable(cfg.ffmpeg) && findExecutable(cfg.whisperBin) && cfg.whisperModel && fs.existsSync(cfg.whisperModel));

let dir: string | undefined;
afterEach(() => dir && removeDir(dir));

describe.skipIf(!ready)('voice pipeline (real tools)', () => {
  it('transcribes synthetic speech', async () => {
    dir = makeTempDir('voice-int');
    const audio = path.join(dir, 'hello.aiff');
    execFileSync('say', ['-o', audio, 'Good morning, the meeting is at three o clock.']);
    const { transcript } = await transcribeFile(
      { stateDir: path.join(dir, 'state'), run: runBinary, ffmpeg: cfg.ffmpeg, whisperBin: cfg.whisperBin, whisperModel: cfg.whisperModel!, uncertainP: cfg.uncertainP },
      audio,
    );
    expect(transcriptText(transcript).toLowerCase()).toMatch(/meeting/);
  }, 120_000);
});
