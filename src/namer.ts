import { Ollama } from 'ollama';
import { z } from 'zod';
import type { Doc } from './clusterText.js';

/** Names that would collide with our own folders or mean nothing. */
const RESERVED = new Set(['_review', 'misc', 'other', 'miscellaneous', 'files', 'documents', 'untitled', 'unknown']);

/** Folder names become path segments, so allow only plain, short, readable names. */
export const FolderNameSchema = z.object({
  folder: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 &'-]*$/, 'letters, digits, spaces, & \' - only')
    .refine((n) => !RESERVED.has(n.toLowerCase()), 'reserved or generic name'),
  reason: z.string().trim().max(200),
});

const SYSTEM = `You organize a person's files into folders by topic.
You are shown several similar files (name plus a text snippet). Reply with JSON: a short folder name (1-4 words, Title Case) that describes what these files have in common, and a one-sentence reason.
Rules:
- Name the TOPIC or document kind (e.g. "Resumes", "Leave Forms", "Bank Statements"), not a person's name or a date.
- Never use vague names like Misc, Other, Files or Documents.
- If an existing folder name below already fits, reuse it exactly.`;

export function buildPrompt(sample: Doc[], existingFolders: string[]): string {
  const files = sample.map((d, i) => `File ${i + 1}: ${d.file.name}\nSnippet: ${d.text.slice(0, 250)}`).join('\n\n');
  const existing = existingFolders.length ? `Existing folders: ${existingFolders.join(', ')}` : 'Existing folders: (none yet)';
  return `${existing}\n\n${files}`;
}

/** Parses and validates a raw model reply. Returns the folder name, or undefined if it's unusable. */
export function parseNameResponse(raw: string): string | undefined {
  try {
    const parsed = FolderNameSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.folder : undefined;
  } catch {
    return undefined;
  }
}

export type ChatFn = (system: string, user: string) => Promise<string>;

export function ollamaChat(model: string): ChatFn {
  const client = new Ollama();
  return async (system, user) => {
    const res = await client.chat({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      format: z.toJSONSchema(FolderNameSchema) as object,
      stream: false,
      options: { temperature: 0, num_ctx: 4096 },
    });
    return res.message.content;
  };
}

/** Builds a NameFn: asks the model, retries once on an invalid reply, gives up (undefined) after that. */
export function createNamer(chat: ChatFn, attempts = 2) {
  return async (sample: Doc[], existingFolders: string[]): Promise<string | undefined> => {
    const prompt = buildPrompt(sample, existingFolders);
    for (let i = 0; i < attempts; i++) {
      let raw: string;
      try {
        raw = await chat(SYSTEM, prompt);
      } catch {
        continue;
      }
      const name = parseNameResponse(raw);
      if (name) return name;
    }
    return undefined;
  };
}
