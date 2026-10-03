import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return n;
}

export const config = {
  /** Scheduled check: only nag when at least this many loose files have piled up... */
  checkMinFiles: numberEnv('CHECK_MIN_FILES', 15),
  /** ...at most once per this many hours... */
  checkCooldownHours: numberEnv('CHECK_COOLDOWN_HOURS', 24),
  /** ...and ignore files touched more recently than this (probably still downloading). */
  checkMinAgeMinutes: numberEnv('CHECK_MIN_AGE_MINUTES', 10),
  /** Where undo journals live (gitignored). */
  stateDir: path.resolve(process.env.STATE_DIR ?? '.state'),
  /** The only directory tree the agent may read or modify. */
  allowedRoot: path.resolve(expandHome(required('ALLOWED_ROOT'))),
  ollamaModel: required('OLLAMA_MODEL'),
  embedModel: process.env.EMBED_MODEL ?? 'nomic-embed-text',
};
