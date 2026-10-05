import fs from 'node:fs/promises';
import mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import { isSensitive, looksLikeSecret } from '../../core/safety/sensitive.js';
import type { FileInfo } from './scanner.js';

const PLAIN_TEXT = new Set(['txt', 'md', 'csv', 'json', 'yml', 'yaml', 'sql']);
const MARKUP = new Set(['html', 'htm']);
const MAX_BYTES_READ = 64 * 1024;
const MAX_PARSE_BYTES = 50 * 1024 * 1024; // don't try to parse giant PDFs/docs

export const DEFAULT_MAX_CHARS = 2000;

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const stripTags = (s: string) =>
  s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');

async function readHead(file: string): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(MAX_BYTES_READ);
    const { bytesRead } = await handle.read(buf, 0, MAX_BYTES_READ, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * Returns the first `maxChars` of readable text, or undefined if the file is sensitive,
 * unsupported, too large, unreadable or empty. Never throws on bad files: one corrupt
 * PDF must not abort a run of 700.
 */
export async function extractText(file: FileInfo, maxChars = DEFAULT_MAX_CHARS): Promise<string | undefined> {
  if (isSensitive(file.name)) return undefined;
  try {
    let text: string;
    if (PLAIN_TEXT.has(file.ext)) {
      text = await readHead(file.path);
    } else if (MARKUP.has(file.ext)) {
      text = stripTags(await readHead(file.path));
    } else if (file.ext === 'pdf' && file.size <= MAX_PARSE_BYTES) {
      // verbosity 0 = errors only; otherwise pdf.js prints a warning per odd font, flooding the terminal
      const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(file.path)), { verbosity: 0 });
      text = (await extractPdfText(pdf, { mergePages: true })).text;
    } else if (file.ext === 'docx' && file.size <= MAX_PARSE_BYTES) {
      text = (await mammoth.extractRawText({ path: file.path })).value;
    } else {
      return undefined;
    }
    if (looksLikeSecret(text)) return undefined;
    const out = normalize(text).slice(0, maxChars);
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}
