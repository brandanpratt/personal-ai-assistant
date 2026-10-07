// Replies and prompts can echo untrusted text (file names, email subjects), so they are cleaned
// before they reach the screen: control characters and bidi overrides (which can disguise text) go.

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function cleanText(text: string, max = 4000): string {
  const flat = text
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** How long to leave a reply on screen: long answers need more reading time. */
export function replyVisibleMs(text: string): number {
  return Math.min(60_000, 8_000 + text.length * 50);
}

/** How long the rings "speak" for a reply of this length (no audio yet, so it is a stand-in). */
export function speakMs(text: string): number {
  return Math.min(6_000, Math.max(1_200, text.length * 35));
}
