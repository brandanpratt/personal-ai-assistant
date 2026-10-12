import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_EXTENSIONS } from './inbox.js';
import { wordErrorRate, type WerResult } from './wer.js';

export interface BaselinePair {
  audio: string;
  /** Same name with .txt: what was actually said, typed by the owner. */
  reference: string;
}

/** Audio files in `dir` (top level) paired with their reference .txt, plus the ones missing one. */
export function findPairs(dir: string): { pairs: BaselinePair[]; missing: string[] } {
  const pairs: BaselinePair[] = [];
  const missing: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('.') || !AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
    const audio = path.join(dir, name);
    if (!fs.lstatSync(audio).isFile()) continue;
    const reference = path.join(dir, `${path.parse(name).name}.txt`);
    if (fs.existsSync(reference)) pairs.push({ audio, reference });
    else missing.push(name);
  }
  return { pairs, missing };
}

export interface BaselineRow {
  name: string;
  result: WerResult;
}

export interface MissedWord {
  word: string;
  count: number;
  /** What Whisper wrote instead ('' when it dropped the word). */
  heardAs: string[];
}

export interface BaselineSummary {
  rows: BaselineRow[];
  /** Pooled over all notes: total errors / total words said. */
  overallWer: number;
  missed: MissedWord[];
}

export function summarize(items: { name: string; reference: string; hypothesis: string }[]): BaselineSummary {
  const rows = items.map((it) => ({ name: it.name, result: wordErrorRate(it.reference, it.hypothesis) }));
  const errors = rows.reduce((a, r) => a + r.result.errors, 0);
  const words = rows.reduce((a, r) => a + r.result.refWords, 0);
  const byWord = new Map<string, MissedWord>();
  for (const r of rows) {
    for (const op of r.result.ops) {
      if (op.type !== 'sub' && op.type !== 'del') continue;
      const m = byWord.get(op.ref) ?? { word: op.ref, count: 0, heardAs: [] };
      m.count++;
      const heard = op.type === 'sub' ? op.hyp : '';
      if (!m.heardAs.includes(heard)) m.heardAs.push(heard);
      byWord.set(op.ref, m);
    }
  }
  const missed = [...byWord.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  return { rows, overallWer: words === 0 ? 0 : errors / words, missed };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const heard = (m: MissedWord) => m.heardAs.map((h) => (h === '' ? '(dropped)' : `"${h}"`)).join(', ');

/** Markdown report. Holds what people said, so it lives in .state (gitignored), never in docs/. */
export function formatBaseline(s: BaselineSummary, model: string, at: Date, top = 20): string {
  return [
    `# Voice baseline ${at.toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    `Model: ${model}. Notes: ${s.rows.length}. Overall word error rate: **${pct(s.overallWer)}**.`,
    '',
    '| Note | Words said | Errors | WER |',
    '|---|---|---|---|',
    ...s.rows.map((r) => `| ${r.name} | ${r.result.refWords} | ${r.result.errors} | ${pct(r.result.wer)} |`),
    '',
    `## Most-missed words (top ${top})`,
    '',
    ...(s.missed.length === 0 ? ['None.'] : s.missed.slice(0, top).map((m) => `- **${m.word}** ×${m.count}: Whisper wrote ${heard(m)}`)),
    '',
  ].join('\n');
}
