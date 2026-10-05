import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

type Env = Record<string, string | undefined>;

export function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

export function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return value;
}

export function numberEnv(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return n;
}

export interface CoreConfig {
  /** Root of all runtime state; each skill gets its own subfolder (gitignored). */
  stateDir: string;
  ollamaModel: string;
  embedModel: string;
}

/** Settings shared by every skill. Skill-specific settings live in the skill's own config. */
export function loadCoreConfig(env: Env = process.env): CoreConfig {
  return {
    stateDir: path.resolve(env.STATE_DIR ?? '.state'),
    ollamaModel: required(env, 'OLLAMA_MODEL'),
    embedModel: env.EMBED_MODEL ?? 'nomic-embed-text',
  };
}
