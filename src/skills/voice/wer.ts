/** Lowercase words with punctuation removed (apostrophes inside words kept: "y'all", "ain't"). */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

export type Op =
  | { type: 'ok'; ref: string; hyp: string }
  | { type: 'sub'; ref: string; hyp: string }
  | { type: 'del'; ref: string }
  | { type: 'ins'; hyp: string };

/** Character edit distance between two words, scaled to 0 (same) .. 1 (nothing in common). */
function charDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1), prev[j]! + 1, cur[j - 1]! + 1);
    prev = cur;
  }
  return prev[b.length]! / Math.max(a.length, b.length, 1);
}

/**
 * Word-level edit alignment of what was said vs what Whisper wrote. Minimizes word errors (standard WER);
 * among equally good alignments it pairs look-alike words ("sayin" with "saying"), so the missed-word
 * list shows what Whisper really heard.
 */
export function align(ref: string[], hyp: string[]): Op[] {
  const n = ref.length, m = hyp.length;
  // cost = word errors + a tie-breaker below 1 (scaled so it can never outweigh one word error)
  const tie = 1 / (n + m + 1);
  const subCost = (i: number, j: number) => (ref[i - 1] === hyp[j - 1] ? 0 : 1 + tie * charDistance(ref[i - 1]!, hyp[j - 1]!));
  const gap = 1 + tie;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i + j) * gap));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) d[i]![j] = Math.min(d[i - 1]![j - 1]! + subCost(i, j), d[i - 1]![j]! + gap, d[i]![j - 1]! + gap);
  }
  const ops: Op[] = [];
  let i = n, j = m;
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && eq(d[i]![j]!, d[i - 1]![j - 1]! + subCost(i, j))) {
      ops.push({ type: ref[i - 1] === hyp[j - 1] ? 'ok' : 'sub', ref: ref[i - 1]!, hyp: hyp[j - 1]! });
      i--; j--;
    } else if (i > 0 && eq(d[i]![j]!, d[i - 1]![j]! + gap)) {
      ops.push({ type: 'del', ref: ref[--i]! });
    } else {
      ops.push({ type: 'ins', hyp: hyp[--j]! });
    }
  }
  return ops.reverse();
}

export interface WerResult {
  /** Word error rate: (substitutions + deletions + insertions) / words actually said. */
  wer: number;
  errors: number;
  refWords: number;
  ops: Op[];
}

export function wordErrorRate(reference: string, hypothesis: string): WerResult {
  const ref = normalizeWords(reference);
  const ops = align(ref, normalizeWords(hypothesis));
  const errors = ops.filter((o) => o.type !== 'ok').length;
  return { wer: ref.length === 0 ? (errors === 0 ? 0 : 1) : errors / ref.length, errors, refWords: ref.length, ops };
}
