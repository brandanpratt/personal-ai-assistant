import type { MessageHeader } from './types.js';

/**
 * Makes untrusted email text safe to print: removes control characters (a subject could carry
 * terminal escape codes that rewrite the screen) and bidi overrides (which can disguise text),
 * collapses whitespace, and caps the length.
 */
export function clean(text: string, max = 80): string {
  const flat = text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function shortDate(d: Date, now = new Date()): string {
  if (Number.isNaN(d.getTime())) return '?';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

export function formatHeaders(headers: MessageHeader[], now = new Date()): string {
  if (headers.length === 0) return '  (no messages)';
  return headers
    .map((h) => `  ${h.unread ? '●' : ' '} ${shortDate(h.date, now).padEnd(16)} ${clean(h.from, 32).padEnd(32)}  ${clean(h.subject) || '(no subject)'}`)
    .join('\n');
}
