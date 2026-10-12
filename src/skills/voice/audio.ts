import path from 'node:path';
import type { RunFn } from './run.js';

/**
 * Converts a voice note to the 16 kHz mono wav Whisper wants, written into `workDir`.
 * The original is only read. The input path is absolute so it can never be mistaken for a flag.
 */
export async function toWav(run: RunFn, ffmpeg: string, input: string, workDir: string): Promise<string> {
  const out = path.join(workDir, 'audio.wav');
  await run(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', path.resolve(input), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', out]);
  return out;
}
