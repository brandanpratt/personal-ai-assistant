import { durationMs, shortId, type Transcript } from './transcribe.js';
import type { Segment } from './whisper.js';

/** Makes untrusted text (file names, transcripts) safe to print: no control or bidi characters. */
export function clean(text: string, max = Infinity): string {
  const flat = text
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A segment's text with low-confidence words shown as [?word]. */
export function markedText(seg: Segment): string {
  if (seg.words.length === 0) return clean(seg.text);
  return clean(seg.words.map((w) => (w.uncertain ? `[?${w.text}]` : w.text)).join(' ').replace(/ ([,.!?;:])/g, '$1'));
}

/** The raw transcript, one segment per line with its start time. Always shown before any interpretation. */
export function formatTranscript(t: Transcript): string {
  const head = `Note ${shortId(t.hash)} · ${clean(t.source, 60)} · ${formatDuration(durationMs(t))}`;
  if (t.segments.length === 0) return `${head}\n  (no speech found)`;
  const lines = t.segments.map((s) => `  ${formatDuration(s.fromMs).padStart(5)}  ${markedText(s)}`);
  const unsure = t.segments.some((s) => s.words.some((w) => w.uncertain));
  return [head, 'Transcript (raw Whisper output):', ...lines, ...(unsure ? ['  [?word] = Whisper was unsure'] : [])].join('\n');
}
