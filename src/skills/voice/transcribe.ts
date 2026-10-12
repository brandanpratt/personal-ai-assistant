import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../../core/util.js';
import { toWav } from './audio.js';
import type { RunFn } from './run.js';
import { runWhisper, type Segment } from './whisper.js';

export interface Transcript {
  /** sha256 of the audio bytes, so a renamed or re-saved note is still recognized. */
  hash: string;
  /** File name of the Whisper model used; a different model means a fresh transcript. */
  model: string;
  /** Name of the note when it was transcribed (for display only). */
  source: string;
  transcribedAt: string;
  segments: Segment[];
}

export const shortId = (hash: string) => hash.slice(0, 8);

export function hashFile(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export const transcriptsDir = (stateDir: string) => path.join(stateDir, 'transcripts');
const transcriptFile = (stateDir: string, hash: string) => path.join(transcriptsDir(stateDir), `${hash}.json`);

export function loadTranscript(stateDir: string, hash: string): Transcript | undefined {
  const t = readJson(transcriptFile(stateDir, hash)) as Transcript | undefined;
  return t && t.hash === hash && Array.isArray(t.segments) ? t : undefined;
}

export const transcriptText = (t: Transcript) => t.segments.map((s) => s.text).join(' ');
export const durationMs = (t: Transcript) => t.segments.at(-1)?.toMs ?? 0;

export interface TranscribeDeps {
  stateDir: string;
  run: RunFn;
  ffmpeg: string;
  whisperBin: string;
  whisperModel: string;
  uncertainP: number;
  prompt?: string;
}

/**
 * Transcribes one voice note locally: ffmpeg -> wav in a temp folder -> whisper.cpp.
 * Cached by audio hash + model, so asking again is instant. The original file is only read.
 */
export async function transcribeFile(
  d: TranscribeDeps,
  file: string,
  opts: { force?: boolean; hash?: string } = {},
): Promise<{ transcript: Transcript; cached: boolean }> {
  const hash = opts.hash ?? hashFile(file);
  const model = path.basename(d.whisperModel);
  const existing = loadTranscript(d.stateDir, hash);
  if (existing && existing.model === model && !opts.force) return { transcript: existing, cached: true };

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  try {
    const wav = await toWav(d.run, d.ffmpeg, file, work);
    const segments = await runWhisper(
      { run: d.run, bin: d.whisperBin, model: d.whisperModel, uncertainP: d.uncertainP, prompt: d.prompt },
      wav,
      work,
    );
    const transcript: Transcript = { hash, model, source: path.basename(file), transcribedAt: new Date().toISOString(), segments };
    writeJsonAtomic(transcriptFile(d.stateDir, hash), transcript);
    return { transcript, cached: false };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
