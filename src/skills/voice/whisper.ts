import path from 'node:path';
import { z } from 'zod';
import { readJson } from '../../core/util.js';
import type { RunFn } from './run.js';

export interface Word {
  text: string;
  /** Whisper's confidence, 0-1: the lowest of the word's tokens. */
  p: number;
  uncertain: boolean;
}

export interface Segment {
  fromMs: number;
  toMs: number;
  text: string;
  words: Word[];
}

/** The parts of whisper.cpp's `--output-json-full` we use. Anything else is ignored. */
const Token = z.object({ text: z.string(), p: z.number() });
const WhisperJson = z.object({
  transcription: z.array(
    z.object({
      offsets: z.object({ from: z.number(), to: z.number() }),
      text: z.string(),
      tokens: z.array(Token).default([]),
    }),
  ),
});

/** Special tokens such as [_BEG_] and [_TT_150] are timing markers, not speech. */
const isSpecial = (t: string) => /^\[_.*\]$/.test(t.trim());

/** Whole segments Whisper emits for silence or noise rather than speech. */
const NON_SPEECH = /^\s*(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*)\s*$/;

/** Groups subword tokens into words (a leading space starts a new word) and marks low-confidence ones. */
export function toWords(tokens: z.infer<typeof Token>[], uncertainP: number): Word[] {
  const words: { text: string; p: number }[] = [];
  for (const t of tokens) {
    if (isSpecial(t.text) || t.text === '') continue;
    const last = words[words.length - 1];
    if (!last || /^\s/.test(t.text)) words.push({ text: t.text.trim(), p: t.p });
    else {
      last.text += t.text;
      last.p = Math.min(last.p, t.p);
    }
  }
  return words.filter((w) => w.text !== '').map((w) => ({ ...w, uncertain: w.p < uncertainP }));
}

/**
 * Parses whisper.cpp full JSON into segments. Drops empty and non-speech segments ([BLANK_AUDIO], (music))
 * and exact repeats of the previous segment, a common hallucination loop.
 */
export function parseWhisperJson(raw: unknown, uncertainP: number): Segment[] {
  const parsed = WhisperJson.safeParse(raw);
  if (!parsed.success) throw new Error('Whisper output was not in the expected JSON format');
  const out: Segment[] = [];
  for (const s of parsed.data.transcription) {
    const text = s.text.trim();
    if (text === '' || NON_SPEECH.test(text)) continue;
    if (out.length > 0 && out[out.length - 1]!.text.toLowerCase() === text.toLowerCase()) continue;
    out.push({ fromMs: s.offsets.from, toMs: s.offsets.to, text, words: toWords(s.tokens, uncertainP) });
  }
  return out;
}

export interface WhisperOptions {
  run: RunFn;
  bin: string;
  model: string;
  uncertainP: number;
  /** Words to bias Whisper towards (e.g. corrected dialect terms). */
  prompt?: string;
}

/** Runs whisper.cpp on a 16 kHz wav and returns the parsed segments. Output files go in `workDir`. */
export async function runWhisper(o: WhisperOptions, wav: string, workDir: string): Promise<Segment[]> {
  const base = path.join(workDir, 'whisper');
  const args = ['-m', o.model, '-f', wav, '-l', 'en', '-ojf', '-of', base, '-np'];
  if (o.prompt) args.push('--prompt', o.prompt);
  await o.run(o.bin, args);
  const raw = readJson(`${base}.json`);
  if (raw === undefined) throw new Error('Whisper finished but wrote no JSON output');
  return parseWhisperJson(raw, o.uncertainP);
}
